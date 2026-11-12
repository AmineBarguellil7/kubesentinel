# Local Kubernetes cluster (kind + Terraform)

Stands up a local [kind](https://kind.sigs.k8s.io/) cluster named `kubesentinel` using the
[`tehcyx/kind`](https://registry.terraform.io/providers/tehcyx/kind/latest) provider:

- 1 control-plane node + 2 workers
- Control-plane ports 80 / 443 are published on the host as `127.0.0.1:8080` / `127.0.0.1:8443`,
  so an ingress controller or gateway can be reached from the host later
- Control-plane node is labelled `ingress-ready=true`

## Prerequisites

- Docker (running)
- Terraform >= 1.5
- kubectl

The `kind` CLI is not required; the provider embeds it.

## Usage

```bash
cd infra/terraform

terraform init
terraform apply      # takes a few minutes on first run (pulls the node image)
terraform destroy    # deletes the cluster
```

`apply` merges a `kind-kubesentinel` context into your default kubeconfig (`~/.kube/config`) and
makes it the current context. It also writes a standalone copy to `./kubesentinel-config`
(git-ignored, contains credentials).

## Verify

```bash
kubectl config use-context "$(terraform output -raw kubeconfig_context)"
kubectl get nodes
```

Expect three `Ready` nodes:

```
NAME                         STATUS   ROLES           AGE   VERSION
kubesentinel-control-plane   Ready    control-plane   ...   ...
kubesentinel-worker          Ready    <none>          ...   ...
kubesentinel-worker2         Ready    <none>          ...   ...
```

To use the standalone kubeconfig instead of `~/.kube/config`:

```bash
kubectl --kubeconfig "$(terraform output -raw kubeconfig_path)" get nodes
```

Check the host port mappings:

```bash
docker port kubesentinel-control-plane
```

Nothing listens on 8080 / 8443 until an ingress controller or gateway is installed.

## Variables

| Name              | Default        | Description                                                |
| ----------------- | -------------- | ---------------------------------------------------------- |
| `cluster_name`    | `kubesentinel` | Cluster name; the context is `kind-<cluster_name>`         |
| `worker_count`    | `2`            | Number of worker nodes                                     |
| `node_image`      | `null`         | `kindest/node` image; null uses the provider's default     |
| `http_host_port`  | `8080`         | Host port forwarded to control-plane port 80               |
| `https_host_port` | `8443`         | Host port forwarded to control-plane port 443              |
| `listen_address`  | `127.0.0.1`    | Host address the forwarded ports bind to                   |

Changing any of these replaces the cluster: kind cannot modify a running cluster in place.

## Outputs

| Name                 | Description                              |
| -------------------- | ---------------------------------------- |
| `kubeconfig_context` | kubectl context name (`kind-kubesentinel`) |
| `cluster_name`       | Cluster name                             |
| `kubeconfig_path`    | Path of the standalone kubeconfig file   |
| `endpoint`           | API server endpoint                      |
