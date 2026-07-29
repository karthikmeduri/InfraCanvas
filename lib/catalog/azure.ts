import {
  alphaNumName,
  attr,
  block,
  bool,
  dnsName,
  flag,
  list,
  num,
  raw,
  resource,
  str,
} from "../hcl";
import type { ProviderDefinition, VariableSpec } from "../types";
import { defineService, number, select, text, toggle } from "./helpers";

const SUBNET_VAR: VariableSpec = {
  name: "subnet_id",
  type: "string",
  description: "Existing subnet id used when a resource is not connected to a subnet.",
};

const VNET_VAR: VariableSpec = {
  name: "virtual_network_name",
  type: "string",
  description: "Existing virtual network name used when no VNet is connected.",
};

const RG = raw("azurerm_resource_group.main.name");
const LOCATION = raw("azurerm_resource_group.main.location");

/** Every Azure resource shares the resource group + location + tags trio. */
const scope = () => [
  attr("resource_group_name", RG),
  attr("location", LOCATION),
];

export const azure: ProviderDefinition = {
  id: "azure",
  name: "Microsoft Azure",
  shortName: "Azure",
  tagline: "Model enterprise-ready Azure landing zones with the azurerm provider.",
  accent: "#0078d4",
  source: "hashicorp/azurerm",
  versionConstraint: "~> 4.0",
  defaultRegion: "East US",
  services: [
    /* ------------------------------------------------------------ Networking */
    defineService({
      id: "vnet",
      name: "Virtual Network",
      short: "VNET",
      category: "Networking",
      role: "network",
      tfType: "azurerm_virtual_network",
      description: "Private Azure network boundary",
      docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/virtual_network",
      fields: [text("address_space", "Address space", "10.0.0.0/16")],
      emit: (c) => {
        c.output({
          name: `${c.name}_id`,
          value: raw(`azurerm_virtual_network.${c.name}.id`),
          description: `Id of the ${c.display} virtual network`,
        });
        return [
          resource("azurerm_virtual_network", c.name, [
            attr("name", str(dnsName(c.display, "vnet", 64))),
            ...scope(),
            attr("address_space", list(str(c.v.address_space || "10.0.0.0/16"))),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "subnet",
      name: "Subnet",
      short: "SUB",
      category: "Networking",
      role: "subnet",
      tfType: "azurerm_subnet",
      description: "Virtual network segment",
      fields: [
        text("prefix", "Address prefix", "10.0.1.0/24"),
        select("service_endpoints", "Service endpoint", ["none", "Microsoft.Storage", "Microsoft.Sql", "Microsoft.KeyVault"]),
      ],
      emit: (c) => [
        resource("azurerm_subnet", c.name, [
          attr("name", str(dnsName(c.display, "subnet", 64))),
          attr("resource_group_name", RG),
          attr("virtual_network_name", c.ref("network", "name", VNET_VAR)),
          attr("address_prefixes", list(str(c.v.prefix || "10.0.1.0/24"))),
          ...(c.v.service_endpoints && c.v.service_endpoints !== "none"
            ? [attr("service_endpoints", list(str(c.v.service_endpoints)))]
            : []),
        ]),
      ],
    }),
    defineService({
      id: "public_ip",
      name: "Public IP Address",
      short: "PIP",
      category: "Networking",
      role: "gateway",
      tfType: "azurerm_public_ip",
      description: "Static public address for gateways",
      fields: [select("sku", "SKU", ["Standard", "Basic"])],
      emit: (c) => [
        resource("azurerm_public_ip", c.name, [
          attr("name", str(dnsName(c.display, "public-ip", 64))),
          ...scope(),
          attr("allocation_method", str("Static")),
          attr("sku", str(c.v.sku || "Standard")),
          attr("zones", list(str("1"), str("2"), str("3"))),
          attr("tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "app_gateway",
      name: "Application Gateway",
      short: "AGW",
      category: "Networking",
      role: "loadbalancer",
      tfType: "azurerm_application_gateway",
      description: "Layer 7 load balancer with optional WAF",
      fields: [
        select("sku", "SKU", ["Standard_v2", "WAF_v2"]),
        number("capacity", "Instance capacity", "2"),
        number("backend_port", "Backend port", "80"),
      ],
      emit: (c) => {
        const publicIp = c.ref("gateway", "id", {
          name: "application_gateway_public_ip_id",
          type: "string",
          description: "Public IP id assigned to the application gateway frontend.",
        });
        const gatewaySubnet = c.ref("subnet", "id", SUBNET_VAR);
        c.output({
          name: `${c.name}_id`,
          value: raw(`azurerm_application_gateway.${c.name}.id`),
          description: `Id of ${c.display}`,
        });
        return [
          resource("azurerm_application_gateway", c.name, [
            attr("name", str(dnsName(c.display, "app-gateway", 64))),
            ...scope(),
            block("sku", [], [
              attr("name", str(c.v.sku || "Standard_v2")),
              attr("tier", str(c.v.sku || "Standard_v2")),
              attr("capacity", num(c.v.capacity, 2)),
            ]),
            block("gateway_ip_configuration", [], [
              attr("name", str("gateway-ip-config")),
              attr("subnet_id", gatewaySubnet),
            ]),
            block("frontend_port", [], [
              attr("name", str("http")),
              attr("port", num(80, 80)),
            ]),
            block("frontend_ip_configuration", [], [
              attr("name", str("frontend")),
              attr("public_ip_address_id", publicIp),
            ]),
            block("backend_address_pool", [], [attr("name", str("backend-pool"))]),
            block("backend_http_settings", [], [
              attr("name", str("backend-settings")),
              attr("cookie_based_affinity", str("Disabled")),
              attr("port", num(c.v.backend_port, 80)),
              attr("protocol", str("Http")),
              attr("request_timeout", num(30, 30)),
            ]),
            block("http_listener", [], [
              attr("name", str("http-listener")),
              attr("frontend_ip_configuration_name", str("frontend")),
              attr("frontend_port_name", str("http")),
              attr("protocol", str("Http")),
            ]),
            block("request_routing_rule", [], [
              attr("name", str("primary")),
              attr("priority", num(100, 100)),
              attr("rule_type", str("Basic")),
              attr("http_listener_name", str("http-listener")),
              attr("backend_address_pool_name", str("backend-pool")),
              attr("backend_http_settings_name", str("backend-settings")),
            ]),
            ...(c.v.sku === "WAF_v2"
              ? [
                  block("waf_configuration", [], [
                    attr("enabled", bool(true)),
                    attr("firewall_mode", str("Prevention")),
                    attr("rule_set_type", str("OWASP")),
                    attr("rule_set_version", str("3.2")),
                  ]),
                ]
              : []),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "front_door",
      name: "Front Door (CDN)",
      short: "AFD",
      category: "Networking",
      role: "cdn",
      tfType: "azurerm_cdn_frontdoor_profile",
      description: "Global edge delivery and acceleration",
      fields: [select("sku", "SKU", ["Standard_AzureFrontDoor", "Premium_AzureFrontDoor"])],
      emit: (c) => [
        resource("azurerm_cdn_frontdoor_profile", c.name, [
          attr("name", str(dnsName(c.display, "front-door", 64))),
          attr("resource_group_name", RG),
          attr("sku_name", str(c.v.sku || "Standard_AzureFrontDoor")),
          attr("tags", c.tags),
        ]),
        resource("azurerm_cdn_frontdoor_endpoint", c.name, [
          attr("name", str(dnsName(c.display, "endpoint", 46))),
          attr("cdn_frontdoor_profile_id", raw(`azurerm_cdn_frontdoor_profile.${c.name}.id`)),
          attr("tags", c.tags),
        ]),
      ],
    }),

    /* --------------------------------------------------------------- Compute */
    defineService({
      id: "vm",
      name: "Linux Virtual Machine",
      short: "VM",
      category: "Compute",
      role: "compute",
      tfType: "azurerm_linux_virtual_machine",
      description: "Managed Linux virtual machine",
      docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/linux_virtual_machine",
      fields: [
        select("size", "Machine size", [
          "Standard_B2s",
          "Standard_B2ms",
          "Standard_D2s_v5",
          "Standard_D4s_v5",
          "Standard_E4s_v5",
          "Standard_F8s_v2",
        ]),
        select("image", "Image", ["Ubuntu 24.04 LTS", "Ubuntu 22.04 LTS", "RHEL 9"]),
        number("count", "Instance count", "2"),
        number("os_disk_size", "OS disk (GB)", "64"),
        select("disk_type", "Disk type", ["Premium_LRS", "StandardSSD_LRS"]),
      ],
      emit: (c) => {
        const adminUser = c.variable({
          name: "admin_username",
          type: "string",
          description: "Administrator username for Linux virtual machines.",
          default: str("azureadmin"),
        });
        const sshKey = c.variable({
          name: "ssh_public_key",
          type: "string",
          description: "SSH public key authorised on the virtual machines.",
        });

        const instanceCount = Math.max(1, Number.parseInt(c.v.count || "1", 10) || 1);
        const multiple = instanceCount > 1;
        const image = c.v.image || "Ubuntu 24.04 LTS";
        const imageRef = image.startsWith("RHEL")
          ? { publisher: "RedHat", offer: "RHEL", sku: "9-lvm-gen2" }
          : image.includes("22.04")
            ? { publisher: "Canonical", offer: "0001-com-ubuntu-server-jammy", sku: "22_04-lts-gen2" }
            : { publisher: "Canonical", offer: "ubuntu-24_04-lts", sku: "server" };

        const suffix = multiple ? "-${count.index + 1}" : "";
        return [
          resource("azurerm_network_interface", c.name, [
            ...(multiple ? [attr("count", num(instanceCount, 1))] : []),
            attr("name", raw(`"${dnsName(c.display, "vm", 60)}-nic${suffix}"`)),
            ...scope(),
            block("ip_configuration", [], [
              attr("name", str("internal")),
              attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
              attr("private_ip_address_allocation", str("Dynamic")),
            ]),
            attr("tags", c.tags),
          ]),
          resource("azurerm_linux_virtual_machine", c.name, [
            ...(multiple ? [attr("count", num(instanceCount, 1))] : []),
            attr("name", raw(`"${dnsName(c.display, "vm", 60)}${suffix}"`)),
            ...scope(),
            attr("size", str(c.v.size || "Standard_B2s")),
            attr("admin_username", adminUser),
            attr(
              "network_interface_ids",
              raw(
                multiple
                  ? `[azurerm_network_interface.${c.name}[count.index].id]`
                  : `[azurerm_network_interface.${c.name}.id]`,
              ),
            ),
            block("admin_ssh_key", [], [
              attr("username", adminUser),
              attr("public_key", sshKey),
            ]),
            block("os_disk", [], [
              attr("caching", str("ReadWrite")),
              attr("storage_account_type", str(c.v.disk_type || "Premium_LRS")),
              attr("disk_size_gb", num(c.v.os_disk_size, 64)),
            ]),
            block("source_image_reference", [], [
              attr("publisher", str(imageRef.publisher)),
              attr("offer", str(imageRef.offer)),
              attr("sku", str(imageRef.sku)),
              attr("version", str("latest")),
            ]),
            block("identity", [], [attr("type", str("SystemAssigned"))]),
            attr("encryption_at_host_enabled", bool(false)),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "app_service",
      name: "App Service (Web App)",
      short: "WEB",
      category: "Compute",
      role: "compute",
      tfType: "azurerm_linux_web_app",
      description: "Managed web application hosting",
      fields: [
        select("sku", "Plan SKU", ["P1v3", "P2v3", "S1", "B1"]),
        select("runtime", "Runtime stack", ["node", "python", "dotnet", "java"]),
        toggle("always_on", "Always on", true),
      ],
      emit: (c) => {
        const runtime = c.v.runtime || "node";
        const stack =
          runtime === "python"
            ? attr("python_version", str("3.12"))
            : runtime === "dotnet"
              ? attr("dotnet_version", str("8.0"))
              : runtime === "java"
                ? attr("java_version", str("21"))
                : attr("node_version", str("22-lts"));
        c.output({
          name: `${c.name}_hostname`,
          value: raw(`azurerm_linux_web_app.${c.name}.default_hostname`),
          description: `Default hostname for ${c.display}`,
        });
        return [
          resource("azurerm_service_plan", c.name, [
            attr("name", str(dnsName(`${c.display}-plan`, "app-plan", 60))),
            ...scope(),
            attr("os_type", str("Linux")),
            attr("sku_name", str(c.v.sku || "P1v3")),
            attr("tags", c.tags),
          ]),
          resource("azurerm_linux_web_app", c.name, [
            attr("name", str(dnsName(c.display, "web-app", 60))),
            ...scope(),
            attr("service_plan_id", raw(`azurerm_service_plan.${c.name}.id`)),
            attr("https_only", bool(true)),
            block("site_config", [], [
              attr("always_on", flag(c.v.always_on, true)),
              attr("ftps_state", str("Disabled")),
              attr("minimum_tls_version", str("1.2")),
              block("application_stack", [], [stack]),
            ]),
            block("identity", [], [attr("type", str("SystemAssigned"))]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "functions",
      name: "Azure Functions",
      short: "FN",
      category: "Compute",
      role: "serverless",
      tfType: "azurerm_linux_function_app",
      description: "Serverless event processing",
      fields: [
        select("runtime", "Runtime", ["node", "python", "dotnet-isolated", "java"]),
        select("plan", "Hosting plan", ["Consumption", "Premium"]),
      ],
      emit: (c) => {
        const runtime = c.v.runtime || "node";
        const stack =
          runtime === "python"
            ? attr("python_version", str("3.12"))
            : runtime === "dotnet-isolated"
              ? attr("dotnet_version", str("8.0"))
              : runtime === "java"
                ? attr("java_version", str("21"))
                : attr("node_version", str("22"));
        const storageName = c.ref(
          "storage",
          (target) => `azurerm_storage_account.${target.name}.name`,
          {
            name: "functions_storage_account_name",
            type: "string",
            description: "Storage account backing the function app.",
          },
        );
        const storageKey = c.ref(
          "storage",
          (target) => `azurerm_storage_account.${target.name}.primary_access_key`,
          {
            name: "functions_storage_account_key",
            type: "string",
            description: "Access key for the function app storage account.",
          },
        );
        return [
          resource("azurerm_service_plan", `${c.name}_plan`, [
            attr("name", str(dnsName(`${c.display}-plan`, "fn-plan", 60))),
            ...scope(),
            attr("os_type", str("Linux")),
            attr("sku_name", str(c.v.plan === "Premium" ? "EP1" : "Y1")),
            attr("tags", c.tags),
          ]),
          resource("azurerm_linux_function_app", c.name, [
            attr("name", str(dnsName(c.display, "function-app", 60))),
            ...scope(),
            attr("service_plan_id", raw(`azurerm_service_plan.${c.name}_plan.id`)),
            attr("storage_account_name", storageName),
            attr("storage_account_access_key", storageKey),
            attr("https_only", bool(true)),
            block("site_config", [], [
              attr("ftps_state", str("Disabled")),
              attr("minimum_tls_version", str("1.2")),
              block("application_stack", [], [stack]),
            ]),
            block("identity", [], [attr("type", str("SystemAssigned"))]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),

    /* ------------------------------------------------------------ Containers */
    defineService({
      id: "aks",
      name: "AKS Cluster",
      short: "AKS",
      category: "Containers",
      role: "container",
      tfType: "azurerm_kubernetes_cluster",
      description: "Managed Kubernetes service",
      fields: [
        select("version", "Kubernetes version", ["1.33", "1.32", "1.31"]),
        select("vm_size", "Node size", ["Standard_D2s_v5", "Standard_D4s_v5", "Standard_B2ms"]),
        number("node_count", "Node count", "2"),
        toggle("private_cluster", "Private cluster", true),
      ],
      emit: (c) => {
        c.output({
          name: `${c.name}_fqdn`,
          value: raw(`azurerm_kubernetes_cluster.${c.name}.fqdn`),
          description: `API server address for ${c.display}`,
        });
        return [
          resource("azurerm_kubernetes_cluster", c.name, [
            attr("name", str(dnsName(c.display, "aks", 60))),
            ...scope(),
            attr("dns_prefix", str(dnsName(c.display, "aks", 40))),
            attr("kubernetes_version", str(c.v.version || "1.33")),
            attr("private_cluster_enabled", flag(c.v.private_cluster, true)),
            attr("local_account_disabled", bool(true)),
            block("default_node_pool", [], [
              attr("name", str("system")),
              attr("node_count", num(c.v.node_count, 2)),
              attr("vm_size", str(c.v.vm_size || "Standard_D2s_v5")),
              attr("vnet_subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
              attr("only_critical_addons_enabled", bool(false)),
              attr("os_disk_type", str("Managed")),
            ]),
            block("identity", [], [attr("type", str("SystemAssigned"))]),
            block("network_profile", [], [
              attr("network_plugin", str("azure")),
              attr("network_policy", str("azure")),
              attr("load_balancer_sku", str("standard")),
            ]),
            block("azure_active_directory_role_based_access_control", [], [
              attr("azure_rbac_enabled", bool(true)),
            ]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "acr",
      name: "Container Registry",
      short: "ACR",
      category: "Containers",
      role: "registry",
      tfType: "azurerm_container_registry",
      description: "Private container image registry",
      fields: [select("sku", "SKU", ["Standard", "Premium", "Basic"])],
      emit: (c) => [
        resource("azurerm_container_registry", c.name, [
          attr("name", str(alphaNumName(c.display, "registry", 50))),
          ...scope(),
          attr("sku", str(c.v.sku || "Standard")),
          attr("admin_enabled", bool(false)),
          attr("tags", c.tags),
        ]),
      ],
    }),

    /* -------------------------------------------------------------- Database */
    defineService({
      id: "postgres",
      name: "PostgreSQL Flexible Server",
      short: "PG",
      category: "Database",
      role: "database",
      tfType: "azurerm_postgresql_flexible_server",
      description: "Managed PostgreSQL",
      fields: [
        select("sku", "Compute size", ["B_Standard_B1ms", "GP_Standard_D2s_v3", "GP_Standard_D4s_v3"]),
        select("version", "Engine version", ["16", "15", "14"]),
        number("storage_mb", "Storage (MB)", "32768"),
        toggle("high_availability", "Zone redundant HA", false),
      ],
      emit: (c) => {
        const username = c.variable({
          name: "database_username",
          type: "string",
          description: "Administrator login for managed databases.",
          default: str("psqladmin"),
          sensitive: true,
        });
        const password = c.variable({
          name: "database_password",
          type: "string",
          description: "Administrator password. Supply from a secrets manager.",
          sensitive: true,
          validation: {
            condition: "length(var.database_password) >= 16",
            errorMessage: "Use a database password of at least 16 characters.",
          },
        });
        c.output({
          name: `${c.name}_fqdn`,
          value: raw(`azurerm_postgresql_flexible_server.${c.name}.fqdn`),
          description: `Connection host for ${c.display}`,
          sensitive: true,
        });
        return [
          resource("azurerm_postgresql_flexible_server", c.name, [
            attr("name", str(dnsName(c.display, "postgres", 60))),
            ...scope(),
            attr("version", str(c.v.version || "16")),
            attr("sku_name", str(c.v.sku || "GP_Standard_D2s_v3")),
            attr("storage_mb", num(c.v.storage_mb, 32768)),
            attr("administrator_login", username),
            attr("administrator_password", password),
            attr("backup_retention_days", num(14, 14)),
            attr("geo_redundant_backup_enabled", bool(false)),
            attr("public_network_access_enabled", bool(false)),
            ...(c.v.high_availability === "true"
              ? [block("high_availability", [], [attr("mode", str("ZoneRedundant"))])]
              : []),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "sql",
      name: "Azure SQL Database",
      short: "SQL",
      category: "Database",
      role: "database",
      tfType: "azurerm_mssql_server",
      description: "Managed SQL Server database",
      fields: [
        select("sku", "Compute size", ["GP_S_Gen5_1", "GP_Gen5_2", "BC_Gen5_2", "S0"]),
        number("max_size_gb", "Max size (GB)", "32"),
        toggle("zone_redundant", "Zone redundant", false),
      ],
      emit: (c) => {
        const username = c.variable({
          name: "database_username",
          type: "string",
          description: "Administrator login for managed databases.",
          default: str("sqladmin"),
          sensitive: true,
        });
        const password = c.variable({
          name: "database_password",
          type: "string",
          description: "Administrator password. Supply from a secrets manager.",
          sensitive: true,
          validation: {
            condition: "length(var.database_password) >= 16",
            errorMessage: "Use a database password of at least 16 characters.",
          },
        });
        return [
          resource("azurerm_mssql_server", c.name, [
            attr("name", str(dnsName(c.display, "sql-server", 60))),
            ...scope(),
            attr("version", str("12.0")),
            attr("administrator_login", username),
            attr("administrator_login_password", password),
            attr("minimum_tls_version", str("1.2")),
            attr("public_network_access_enabled", bool(false)),
            attr("tags", c.tags),
          ]),
          resource("azurerm_mssql_database", c.name, [
            attr("name", str(dnsName(`${c.display}-db`, "database", 60))),
            attr("server_id", raw(`azurerm_mssql_server.${c.name}.id`)),
            attr("sku_name", str(c.v.sku || "GP_Gen5_2")),
            attr("max_size_gb", num(c.v.max_size_gb, 32)),
            attr("zone_redundant", flag(c.v.zone_redundant, false)),
            attr("storage_account_type", str("Geo")),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),
    defineService({
      id: "cosmos",
      name: "Cosmos DB Account",
      short: "COS",
      category: "Database",
      role: "database",
      tfType: "azurerm_cosmosdb_account",
      description: "Globally distributed multi-model database",
      fields: [
        select("api", "API", ["NoSQL", "MongoDB", "Cassandra", "Gremlin", "Table"]),
        select("consistency", "Consistency level", ["Session", "BoundedStaleness", "Strong", "Eventual"]),
        toggle("free_tier", "Free tier", false),
      ],
      emit: (c) => [
        resource("azurerm_cosmosdb_account", c.name, [
          attr("name", str(dnsName(c.display, "cosmos", 44))),
          ...scope(),
          attr("offer_type", str("Standard")),
          attr("kind", str(c.v.api === "MongoDB" ? "MongoDB" : "GlobalDocumentDB")),
          attr("free_tier_enabled", flag(c.v.free_tier, false)),
          attr("public_network_access_enabled", bool(false)),
          block("consistency_policy", [], [
            attr("consistency_level", str(c.v.consistency || "Session")),
            ...(c.v.consistency === "BoundedStaleness"
              ? [
                  attr("max_interval_in_seconds", num(300, 300)),
                  attr("max_staleness_prefix", num(100000, 100000)),
                ]
              : []),
          ]),
          block("geo_location", [], [
            attr("location", LOCATION),
            attr("failover_priority", num(0, 0)),
          ]),
          block("backup", [], [
            attr("type", str("Continuous")),
            attr("tier", str("Continuous7Days")),
          ]),
          attr("tags", c.tags),
        ]),
      ],
    }),
    defineService({
      id: "redis",
      name: "Azure Cache for Redis",
      short: "CACHE",
      category: "Database",
      role: "cache",
      tfType: "azurerm_redis_cache",
      description: "Managed in-memory cache",
      fields: [
        select("sku", "SKU", ["Standard", "Premium", "Basic"]),
        select("capacity", "Capacity", ["1", "2", "3"]),
      ],
      emit: (c) => [
        resource("azurerm_redis_cache", c.name, [
          attr("name", str(dnsName(c.display, "redis", 60))),
          ...scope(),
          attr("capacity", num(c.v.capacity, 1)),
          attr("family", str(c.v.sku === "Premium" ? "P" : "C")),
          attr("sku_name", str(c.v.sku || "Standard")),
          attr("non_ssl_port_enabled", bool(false)),
          attr("minimum_tls_version", str("1.2")),
          attr("tags", c.tags),
        ]),
      ],
    }),

    /* --------------------------------------------------------------- Storage */
    defineService({
      id: "storage_account",
      name: "Storage Account",
      short: "BLB",
      category: "Storage",
      role: "storage",
      tfType: "azurerm_storage_account",
      description: "Blob, file, queue, and table storage",
      docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/storage_account",
      fields: [
        select("tier", "Access tier", ["Hot", "Cool", "Cold"]),
        select("replication", "Replication", ["LRS", "ZRS", "GRS", "RAGRS"]),
        toggle("versioning", "Blob versioning", true),
      ],
      emit: (c) => {
        c.output({
          name: `${c.name}_name`,
          value: raw(`azurerm_storage_account.${c.name}.name`),
          description: `Storage account name for ${c.display}`,
        });
        return [
          resource("azurerm_storage_account", c.name, [
            attr("name", str(alphaNumName(c.display, "storage", 24))),
            ...scope(),
            attr("account_tier", str("Standard")),
            attr("account_replication_type", str(c.v.replication || "LRS")),
            attr("access_tier", str(c.v.tier || "Hot")),
            attr("min_tls_version", str("TLS1_2")),
            attr("https_traffic_only_enabled", bool(true)),
            attr("allow_nested_items_to_be_public", bool(false)),
            attr("shared_access_key_enabled", bool(true)),
            block("blob_properties", [], [
              block("delete_retention_policy", [], [attr("days", num(30, 30))]),
              attr("versioning_enabled", flag(c.v.versioning, true)),
            ]),
            block("identity", [], [attr("type", str("SystemAssigned"))]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),

    /* -------------------------------------------------------------- Security */
    defineService({
      id: "nsg",
      name: "Network Security Group",
      short: "NSG",
      category: "Security",
      role: "firewall",
      tfType: "azurerm_network_security_group",
      description: "Subnet and NIC level firewall rules",
      fields: [
        number("port", "Inbound port", "443"),
        text("source", "Source prefix", "VirtualNetwork", "Use VirtualNetwork or a CIDR rather than *."),
      ],
      emit: (c) => [
        resource("azurerm_network_security_group", c.name, [
          attr("name", str(dnsName(c.display, "nsg", 60))),
          ...scope(),
          block("security_rule", [], [
            attr("name", str(`allow-${Number.parseInt(c.v.port || "443", 10) || 443}`)),
            attr("priority", num(100, 100)),
            attr("direction", str("Inbound")),
            attr("access", str("Allow")),
            attr("protocol", str("Tcp")),
            attr("source_port_range", str("*")),
            attr("destination_port_range", str(String(Number.parseInt(c.v.port || "443", 10) || 443))),
            attr("source_address_prefix", str(c.v.source || "VirtualNetwork")),
            attr("destination_address_prefix", str("*")),
          ]),
          attr("tags", c.tags),
        ]),
        resource("azurerm_subnet_network_security_group_association", c.name, [
          attr("subnet_id", c.ref("subnet", "id", SUBNET_VAR)),
          attr("network_security_group_id", raw(`azurerm_network_security_group.${c.name}.id`)),
        ]),
      ],
    }),
    defineService({
      id: "key_vault",
      name: "Key Vault",
      short: "KV",
      category: "Security",
      role: "secrets",
      tfType: "azurerm_key_vault",
      description: "Managed secrets, keys, and certificates",
      fields: [
        select("sku", "SKU", ["standard", "premium"]),
        number("retention_days", "Soft delete retention (days)", "30"),
      ],
      emit: (c) => {
        c.data(
          "azurerm_client_config",
          block("data", ["azurerm_client_config", "current"], []),
        );
        return [
          resource("azurerm_key_vault", c.name, [
            attr("name", str(dnsName(c.display, "key-vault", 24))),
            ...scope(),
            attr("tenant_id", raw("data.azurerm_client_config.current.tenant_id")),
            attr("sku_name", str(c.v.sku || "standard")),
            attr("purge_protection_enabled", bool(true)),
            attr("soft_delete_retention_days", num(c.v.retention_days, 30)),
            attr("enable_rbac_authorization", bool(true)),
            attr("public_network_access_enabled", bool(false)),
            block("network_acls", [], [
              attr("bypass", str("AzureServices")),
              attr("default_action", str("Deny")),
            ]),
            attr("tags", c.tags),
          ]),
        ];
      },
    }),

    /* ----------------------------------------------------------- Integration */
    defineService({
      id: "servicebus",
      name: "Service Bus Queue",
      short: "SB",
      category: "Integration",
      role: "queue",
      tfType: "azurerm_servicebus_namespace",
      description: "Enterprise messaging with dead lettering",
      fields: [
        select("sku", "SKU", ["Standard", "Premium", "Basic"]),
        number("max_delivery_count", "Max delivery count", "5"),
      ],
      emit: (c) => [
        resource("azurerm_servicebus_namespace", c.name, [
          attr("name", str(dnsName(c.display, "servicebus", 50))),
          ...scope(),
          attr("sku", str(c.v.sku || "Standard")),
          attr("tags", c.tags),
        ]),
        resource("azurerm_servicebus_queue", c.name, [
          attr("name", str(dnsName(`${c.display}-queue`, "queue", 60))),
          attr("namespace_id", raw(`azurerm_servicebus_namespace.${c.name}.id`)),
          attr("max_delivery_count", num(c.v.max_delivery_count, 5)),
          attr("dead_lettering_on_message_expiration", bool(true)),
        ]),
      ],
    }),

    /* --------------------------------------------------------- Observability */
    defineService({
      id: "log_analytics",
      name: "Log Analytics Workspace",
      short: "LOG",
      category: "Observability",
      role: "monitoring",
      tfType: "azurerm_log_analytics_workspace",
      description: "Central logs and query workspace",
      fields: [
        select("sku", "SKU", ["PerGB2018", "CapacityReservation"]),
        number("retention_days", "Retention (days)", "30"),
      ],
      emit: (c) => [
        resource("azurerm_log_analytics_workspace", c.name, [
          attr("name", str(dnsName(c.display, "log-analytics", 60))),
          ...scope(),
          attr("sku", str(c.v.sku || "PerGB2018")),
          attr("retention_in_days", num(c.v.retention_days, 30)),
          attr("tags", c.tags),
        ]),
      ],
    }),
  ],
};
