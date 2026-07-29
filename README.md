<div align="center">

# ◢ InfraCanvas

### Draw cloud architecture. Configure real values. Generate Terraform.

[![Next.js](https://img.shields.io/badge/Next.js-16-151824?style=flat-square&logo=nextdotjs)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-151824?style=flat-square&logo=react)](https://react.dev/)
[![Terraform](https://img.shields.io/badge/Terraform-ready-725CF5?style=flat-square&logo=terraform)](https://www.terraform.io/)
[![Cloudflare](https://img.shields.io/badge/Cloudflare-Workers-FF8A00?style=flat-square&logo=cloudflare)](https://workers.cloudflare.com/)
[![License](https://img.shields.io/badge/license-MIT-C7F36B?style=flat-square)](#license)

**A modern visual infrastructure builder for AWS, Azure, Google Cloud, and Oracle Cloud.**

</div>

---

## What is InfraCanvas?

InfraCanvas turns cloud architecture into editable infrastructure-as-code. Choose a provider, drag native cloud services onto the canvas, connect them, configure real resource values, and export a complete Terraform starting template.

The included application is an interactive front-end prototype—not a static design:

- Drag services from the provider library onto the canvas
- Reposition resources and connect them visually
- Configure machine types, regions, database engines, storage classes, network ranges, and more
- Generate provider-specific Terraform from the current diagram
- Copy the generated code or download it as a `.tf` file
- Save the current project locally in the browser
- Start from a realistic sample architecture for every provider

## Product workflow

```mermaid
flowchart LR
    A["1 · Choose provider"] --> B["2 · Compose architecture"]
    B --> C["3 · Configure resources"]
    C --> D["4 · Generate Terraform"]
    D --> E["Validate and deploy"]
```

1. **Choose a cloud** — AWS, Azure, GCP, or OCI.
2. **Design visually** — drag provider services to the grid and arrange the system.
3. **Configure precisely** — select any resource and define its infrastructure values.
4. **Connect the flow** — enable Connect mode and select the source and destination.
5. **Generate code** — review, copy, or download the generated Terraform.

## Supported provider libraries

| Provider | Example services |
| --- | --- |
| **AWS** | VPC, Subnet, ALB, CloudFront, EC2, Lambda, ECS, EKS, RDS, DynamoDB, S3, Security Groups, WAF |
| **Azure** | Virtual Network, Subnet, Application Gateway, Virtual Machine, Functions, AKS, Azure SQL, Cosmos DB, Blob Storage, NSG |
| **Google Cloud** | VPC, Subnetwork, Cloud Load Balancing, Compute Engine, Cloud Run, GKE, Cloud SQL, Firestore, Cloud Storage, Firewall |
| **Oracle Cloud** | VCN, Subnet, Load Balancer, Compute, Functions, OKE, Autonomous Database, MySQL HeatWave, Object Storage, Security Lists |

## Design highlights

The interface uses a purpose-built design system for technical tools:

- A focused, high-density workspace with a bright canvas and restrained chrome
- Provider-aware colors without turning the product into a rainbow dashboard
- Accessible labels, visible focus rings, high-contrast text, and reduced-motion support
- Responsive slide-over panels for smaller screens
- Persistent configuration inspector and inline Terraform preview
- Zero image dependencies: the UI remains fast and crisp at every scale

## Getting started

### Requirements

- Node.js `22.13.0` or newer
- npm `10` or newer

### Run locally

```bash
git clone <your-repository-url>
cd TF-visual-builder
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Production build

```bash
npm run build
npm test
```

## Project structure

```text
TF-visual-builder/
├── app/
│   ├── globals.css          # Complete responsive product design system
│   ├── layout.tsx           # Product metadata and application shell
│   └── page.tsx             # Builder, canvas, configuration, and code generator
├── design-system/
│   └── infracanvas/         # Persisted visual design guidance
├── public/
│   └── favicon.svg
├── tests/
│   └── rendered-html.test.mjs
├── worker/                  # Cloudflare Worker entry
├── package.json
└── vite.config.ts
```

## Terraform output

InfraCanvas produces a structured, provider-aware Terraform template containing:

- Required Terraform and provider versions
- Provider configuration
- Input variables
- Shared locals and tags
- Resource blocks derived from the diagram
- Diagram relationship notes
- A generated architecture summary output

The builder deliberately labels unresolved cross-resource identifiers as placeholders. Cloud accounts, network IDs, secrets, certificates, and organization policies differ, so review the generated template before deployment.

Recommended validation flow:

```bash
terraform fmt
terraform init
terraform validate
terraform plan
```

> [!IMPORTANT]
> Never commit passwords, private keys, cloud credentials, or production secrets. Pass sensitive values through environment variables, an encrypted variable store, or your CI/CD secret manager.

## Current architecture

```mermaid
flowchart TB
    UI["React builder UI"]
    Catalog["Provider resource catalog"]
    Graph["Diagram nodes + connections"]
    Config["Resource configuration inspector"]
    Generator["Provider-aware Terraform generator"]
    Storage["Browser localStorage"]
    Download["Clipboard + .tf download"]

    Catalog --> UI
    UI --> Graph
    Graph --> Config
    Config --> Generator
    Graph --> Generator
    UI <--> Storage
    Generator --> Download
```

## Roadmap

- [ ] Multi-file ZIP export with reusable Terraform modules
- [ ] Import existing Terraform into the visual canvas
- [ ] Undo/redo history and multi-select
- [ ] Nested VPC/VNet/VCN containers
- [ ] Real-time architecture validation and cost hints
- [ ] Team workspaces, comments, and version history
- [ ] GitHub pull request export
- [ ] `terraform plan` visualization

## Contributing

Issues and pull requests are welcome. Keep additions provider-aware, keyboard accessible, and consistent with the existing component and color system.

## License

MIT — use it, adapt it, and build something excellent.

---

<div align="center">

**InfraCanvas** · Infrastructure design that stays close to the code.

</div>
