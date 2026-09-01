import {
  alphaNumName,
  attr,
  block,
  bool,
  dnsName,
  flag,
  num,
  raw,
  resource,
  str,
} from "../../hcl";
import type { ServiceDefinition, VariableSpec } from "../../types";
import { combo, defineService, number, select, text, toggle } from "../helpers";

const RG = raw("azurerm_resource_group.main.name");
const LOCATION = raw("azurerm_resource_group.main.location");
const scope = () => [attr("resource_group_name", RG), attr("location", LOCATION)];

const PUBLIC_IP: VariableSpec = {
  name: "public_ip_id",
  type: "string",
  description: "Existing Azure Public IP id used when no Public IP is connected.",
};
const LOG_WORKSPACE: VariableSpec = {
  name: "log_analytics_workspace_id",
  type: "string",
  description: "Existing Log Analytics workspace id used when no workspace is connected.",
};
const CONTAINER_ENVIRONMENT: VariableSpec = {
  name: "container_app_environment_id",
  type: "string",
  description: "Existing Container Apps environment id.",
};
const CONTAINER_ENVIRONMENT_SUBNET: VariableSpec = {
  name: "container_app_environment_subnet_id",
  type: "string",
  description: "Delegated infrastructure subnet id for the Container Apps environment.",
};
const SYNAPSE_PASSWORD: VariableSpec = {
  name: "synapse_sql_administrator_password",
  type: "string",
  description: "SQL administrator password for Azure Synapse.",
  sensitive: true,
};

export const azureMajorServices: ServiceDefinition[] = [
  defineService({
    id: "load_balancer",
    name: "Load Balancers",
    short: "LB",
    category: "Networking",
    role: "loadbalancer",
    tfType: "azurerm_lb",
    description: "Layer 4 public or private load balancing",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/lb",
    fields: [
      select("sku", "SKU", ["Standard", "Gateway", "Basic"]),
      select("tier", "Tier", ["Regional", "Global"]),
      text("frontend_name", "Frontend name", "public-frontend"),
    ],
    emit: (c) => {
      c.output({ name: `${c.name}_id`, value: raw(`azurerm_lb.${c.name}.id`), description: `Id of ${c.display}` });
      return [resource("azurerm_lb", c.name, [
        attr("name", str(dnsName(c.display, "load-balancer", 80))),
        ...scope(),
        attr("sku", str(c.v.sku || "Standard")),
        attr("sku_tier", str(c.v.tier || "Regional")),
        block("frontend_ip_configuration", [], [
          attr("name", str(c.v.frontend_name || "public-frontend")),
          attr("public_ip_address_id", c.ref("gateway", "id", PUBLIC_IP)),
        ]),
        attr("tags", c.tags),
      ])];
    },
  }),
  defineService({
    id: "container_apps_environment",
    name: "Container Apps Environments",
    short: "CAE",
    category: "Containers",
    role: "container",
    tfType: "azurerm_container_app_environment",
    description: "Secure runtime boundary for Azure Container Apps",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app_environment",
    fields: [
      toggle("zone_redundancy", "Zone redundancy", false),
      text("infrastructure_subnet_id", "Infrastructure subnet id", "", "Optional delegated subnet id."),
    ],
    emit: (c) => {
      const needsInfrastructureSubnet =
        Boolean(c.v.infrastructure_subnet_id) || c.has("subnet") || c.v.zone_redundancy !== "false";
      const infrastructureSubnet = c.v.infrastructure_subnet_id
        ? str(c.v.infrastructure_subnet_id)
        : needsInfrastructureSubnet
          ? c.ref("subnet", "id", CONTAINER_ENVIRONMENT_SUBNET)
          : undefined;
      return [resource("azurerm_container_app_environment", c.name, [
        attr("name", str(dnsName(c.display, "container-environment", 60))),
        ...scope(),
        ...(infrastructureSubnet ? [
          attr("infrastructure_subnet_id", infrastructureSubnet),
          attr("zone_redundancy_enabled", flag(c.v.zone_redundancy, false)),
        ] : []),
        ...(c.has("monitoring") ? [attr("log_analytics_workspace_id", c.ref("monitoring", "id", LOG_WORKSPACE))] : []),
        attr("tags", c.tags),
      ])];
    },
  }),
  defineService({
    id: "container_apps",
    name: "Container Apps",
    short: "CA",
    category: "Containers",
    role: "container",
    tfType: "azurerm_container_app",
    description: "Autoscaling serverless container application",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_app",
    fields: [
      text("image", "Container image", "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest"),
      combo("cpu", "CPU cores", ["0.25", "0.5", "1.0", "2.0"]),
      combo("memory", "Memory", ["0.5Gi", "1Gi", "2Gi", "4Gi"]),
      number("min_replicas", "Minimum replicas", "1"),
      number("max_replicas", "Maximum replicas", "10"),
      number("target_port", "Target port", "80"),
      toggle("external_ingress", "Public ingress", true),
    ],
    emit: (c) => {
      c.output({ name: `${c.name}_fqdn`, value: raw(`azurerm_container_app.${c.name}.latest_revision_fqdn`), description: `FQDN of ${c.display}` });
      return [resource("azurerm_container_app", c.name, [
        attr("name", str(dnsName(c.display, "container-app", 32))),
        attr("resource_group_name", RG),
        attr("container_app_environment_id", c.ref("container", (target) => target.tfType === "azurerm_container_app_environment" ? `${target.tfType}.${target.name}.id` : undefined, CONTAINER_ENVIRONMENT)),
        attr("revision_mode", str("Single")),
        block("template", [], [
          attr("min_replicas", num(c.v.min_replicas, 1)),
          attr("max_replicas", num(c.v.max_replicas, 10)),
          block("container", [], [
            attr("name", str(alphaNumName(c.display, "app", 32))),
            attr("image", str(c.v.image || "mcr.microsoft.com/azuredocs/containerapps-helloworld:latest")),
            attr("cpu", num(c.v.cpu, 0.5)),
            attr("memory", str(c.v.memory || "1Gi")),
          ]),
        ]),
        block("ingress", [], [
          attr("external_enabled", flag(c.v.external_ingress, true)),
          attr("target_port", num(c.v.target_port, 80)),
          block("traffic_weight", [], [attr("percentage", num(100, 100)), attr("latest_revision", bool(true))]),
        ]),
        attr("tags", c.tags),
      ])];
    },
  }),
  defineService({
    id: "api_management",
    name: "API Management Services",
    short: "APIM",
    category: "Integration",
    role: "gateway",
    tfType: "azurerm_api_management",
    description: "Managed API gateway, policies, and developer portal",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/api_management",
    fields: [
      combo("sku_name", "SKU and capacity", ["Developer_1", "BasicV2_1", "StandardV2_1", "Premium_1"]),
      text("publisher_name", "Publisher name", "InfraCanvas"),
      text("publisher_email", "Publisher email", "platform@example.com"),
    ],
    emit: (c) => [resource("azurerm_api_management", c.name, [
      attr("name", str(dnsName(c.display, "api", 50))),
      ...scope(),
      attr("publisher_name", str(c.v.publisher_name || "InfraCanvas")),
      attr("publisher_email", str(c.v.publisher_email || "platform@example.com")),
      attr("sku_name", str(c.v.sku_name || "Developer_1")),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "event_hubs",
    name: "Event Hubs",
    short: "EH",
    category: "Integration",
    role: "queue",
    tfType: "azurerm_eventhub",
    description: "High-throughput event streaming platform",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/eventhub",
    fields: [
      select("sku", "Namespace SKU", ["Standard", "Premium", "Basic"]),
      number("capacity", "Namespace capacity", "1"),
      number("partitions", "Partitions", "4"),
      number("retention", "Retention days", "7"),
    ],
    emit: (c) => {
      const namespace = `${c.name}_namespace`;
      return [
        resource("azurerm_eventhub_namespace", namespace, [
          attr("name", str(dnsName(`${c.display}-namespace`, "events", 50))),
          ...scope(),
          attr("sku", str(c.v.sku || "Standard")),
          attr("capacity", num(c.v.capacity, 1)),
          attr("tags", c.tags),
        ]),
        resource("azurerm_eventhub", c.name, [
          attr("name", str(dnsName(c.display, "event-hub", 50))),
          attr("namespace_name", raw(`azurerm_eventhub_namespace.${namespace}.name`)),
          attr("resource_group_name", RG),
          attr("partition_count", num(c.v.partitions, 4)),
          attr("message_retention", num(c.v.retention, 7)),
        ]),
      ];
    },
  }),
  defineService({
    id: "event_grid_topics",
    name: "Event Grid Topics",
    short: "EG",
    category: "Integration",
    role: "topic",
    tfType: "azurerm_eventgrid_topic",
    description: "Managed publish/subscribe event routing topic",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/eventgrid_topic",
    fields: [select("input_schema", "Input schema", ["EventGridSchema", "CloudEventSchemaV1_0", "CustomEventSchema"]), toggle("public_network", "Public network access", false)],
    emit: (c) => [resource("azurerm_eventgrid_topic", c.name, [
      attr("name", str(dnsName(c.display, "topic", 50))),
      ...scope(),
      attr("input_schema", str(c.v.input_schema || "EventGridSchema")),
      attr("public_network_access_enabled", flag(c.v.public_network, false)),
      attr("local_auth_enabled", bool(true)),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "application_insights",
    name: "Application Insights",
    short: "AI",
    category: "Observability",
    role: "monitoring",
    tfType: "azurerm_application_insights",
    description: "Application performance monitoring and telemetry",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/application_insights",
    fields: [select("application_type", "Application type", ["web", "other", "java", "Node.JS"]), number("retention_days", "Retention days", "90"), toggle("workspace_mode", "Connect Log Analytics", true)],
    emit: (c) => [resource("azurerm_application_insights", c.name, [
      attr("name", str(dnsName(c.display, "insights", 260))),
      ...scope(),
      attr("application_type", str(c.v.application_type || "web")),
      attr("retention_in_days", num(c.v.retention_days, 90)),
      ...(c.v.workspace_mode === "false" ? [] : [attr("workspace_id", c.ref("monitoring", "id", LOG_WORKSPACE))]),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "data_factory",
    name: "Data Factories",
    short: "ADF",
    category: "Analytics",
    role: "analytics",
    tfType: "azurerm_data_factory",
    description: "Cloud-scale data integration and orchestration",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/data_factory",
    fields: [toggle("managed_vnet", "Managed virtual network", true), toggle("public_network", "Public network access", false), toggle("github", "Enable GitHub configuration", false)],
    emit: (c) => [resource("azurerm_data_factory", c.name, [
      attr("name", str(dnsName(c.display, "data-factory", 63))),
      ...scope(),
      attr("managed_virtual_network_enabled", flag(c.v.managed_vnet, true)),
      attr("public_network_enabled", flag(c.v.public_network, false)),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "synapse",
    name: "Azure Synapse Analytics",
    short: "SYN",
    category: "Analytics",
    role: "analytics",
    tfType: "azurerm_synapse_workspace",
    description: "Unified enterprise analytics workspace",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/synapse_workspace",
    fields: [text("sql_admin", "SQL administrator login", "sqladminuser"), toggle("managed_vnet", "Managed virtual network", true), toggle("public_network", "Public network access", false)],
    emit: (c) => {
      const storage = `${c.name}_storage`;
      const filesystem = `${c.name}_filesystem`;
      return [
        resource("azurerm_storage_account", storage, [
          attr("name", str(alphaNumName(`${c.display}lake`, "synapselake", 24))),
          ...scope(),
          attr("account_tier", str("Standard")),
          attr("account_replication_type", str("LRS")),
          attr("account_kind", str("StorageV2")),
          attr("is_hns_enabled", bool(true)),
          attr("tags", c.tags),
        ]),
        resource("azurerm_storage_data_lake_gen2_filesystem", filesystem, [
          attr("name", str("synapse")),
          attr("storage_account_id", raw(`azurerm_storage_account.${storage}.id`)),
        ]),
        resource("azurerm_synapse_workspace", c.name, [
          attr("name", str(dnsName(c.display, "synapse", 50))),
          ...scope(),
          attr("storage_data_lake_gen2_filesystem_id", raw(`azurerm_storage_data_lake_gen2_filesystem.${filesystem}.id`)),
          attr("sql_administrator_login", str(c.v.sql_admin || "sqladminuser")),
          attr("sql_administrator_login_password", c.variable(SYNAPSE_PASSWORD)),
          attr("managed_virtual_network_enabled", flag(c.v.managed_vnet, true)),
          attr("public_network_access_enabled", flag(c.v.public_network, false)),
          attr("tags", c.tags),
        ]),
      ];
    },
  }),
  defineService({
    id: "azure_openai",
    name: "Azure OpenAI",
    short: "AOAI",
    category: "Artificial Intelligence",
    role: "serverless",
    tfType: "azurerm_cognitive_account",
    description: "Managed Azure OpenAI model endpoint",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/cognitive_account",
    fields: [select("sku", "SKU", ["S0"]), text("custom_subdomain", "Custom subdomain", "infracanvas-ai"), toggle("public_network", "Public network access", false), toggle("local_auth", "Local authentication", false)],
    emit: (c) => [resource("azurerm_cognitive_account", c.name, [
      attr("name", str(dnsName(c.display, "openai", 64))),
      ...scope(),
      attr("kind", str("OpenAI")),
      attr("sku_name", str(c.v.sku || "S0")),
      attr("custom_subdomain_name", str(dnsName(c.v.custom_subdomain || c.display, "infracanvas-ai", 64))),
      attr("public_network_access_enabled", flag(c.v.public_network, false)),
      attr("local_auth_enabled", flag(c.v.local_auth, false)),
      attr("tags", c.tags),
    ])],
  }),
  defineService({
    id: "managed_identity",
    name: "Managed Identities",
    short: "MI",
    category: "Security",
    role: "identity",
    tfType: "azurerm_user_assigned_identity",
    description: "Passwordless identity for Azure workloads",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/user_assigned_identity",
    fields: [text("purpose", "Identity purpose", "Application workload identity")],
    emit: (c) => [resource("azurerm_user_assigned_identity", c.name, [attr("name", str(dnsName(c.display, "identity", 128))), ...scope(), attr("tags", c.tags)])],
  }),
  defineService({
    id: "container_instances",
    name: "Container Instances",
    short: "ACI",
    category: "Containers",
    role: "container",
    tfType: "azurerm_container_group",
    description: "On-demand isolated container group",
    docs: "https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs/resources/container_group",
    fields: [
      text("image", "Container image", "mcr.microsoft.com/azuredocs/aci-helloworld:latest"),
      select("os_type", "Operating system", ["Linux", "Windows"]),
      combo("cpu", "CPU cores", ["1", "2", "4"]),
      combo("memory", "Memory (GiB)", ["1.5", "2", "4", "8"]),
      number("port", "Public port", "80"),
      toggle("public_ip", "Public IP", false),
    ],
    emit: (c) => [resource("azurerm_container_group", c.name, [
      attr("name", str(dnsName(c.display, "container-group", 63))),
      ...scope(),
      attr("os_type", str(c.v.os_type || "Linux")),
      attr("ip_address_type", str(c.v.public_ip === "true" ? "Public" : "None")),
      ...(c.v.public_ip === "true" ? [attr("dns_name_label", str(dnsName(c.display, "container", 63)))] : []),
      block("container", [], [
        attr("name", str(alphaNumName(c.display, "app", 63))),
        attr("image", str(c.v.image || "mcr.microsoft.com/azuredocs/aci-helloworld:latest")),
        attr("cpu", num(c.v.cpu, 1)),
        attr("memory", num(c.v.memory, 1.5)),
        block("ports", [], [attr("port", num(c.v.port, 80)), attr("protocol", str("TCP"))]),
      ]),
      attr("tags", c.tags),
    ])],
  }),
];
