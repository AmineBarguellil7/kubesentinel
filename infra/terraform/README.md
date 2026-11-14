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

## Argo CD

`apply` also installs Argo CD into the `argocd` namespace with the
[`argo-cd`](https://github.com/argoproj/argo-helm/tree/main/charts/argo-cd) Helm chart
(settings in `argocd-values.yaml`), then applies the root "app of apps" from the
[kubesentinel-gitops](https://github.com/AmineBarguellil7/kubesentinel-gitops) repo
(`bootstrap/root-app.yaml`). From there Argo CD deploys everything under `apps/` in that repo.

This step needs `kubectl` on the PATH and network access to GitHub.

```bash
kubectl -n argocd get pods
kubectl -n argocd get applications     # expect Synced / Healthy
```

Open the UI at https://localhost:8081 (self-signed certificate, user `admin`):

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d; echo
kubectl -n argocd port-forward svc/argocd-server 8081:443
```

## Deploying workloads

Nothing in this repo is applied to the cluster with `kubectl`. What runs in the cluster is defined
only in [kubesentinel-gitops](https://github.com/AmineBarguellil7/kubesentinel-gitops): change a
manifest there, push to `main`, and Argo CD syncs it (and reverts manual changes in the cluster).

The demo images are still built from this repo, because they are loaded into kind rather than
pushed to a registry. From the repo root:

```bash
make cluster-up       # terraform init + apply: kind cluster, Argo CD, root app
make images           # build kubesentinel-demo-{payments,orders,api}:dev and kind load them
make gitops-status    # Argo CD applications with sync and health status
make status           # nodes, and the demo deployments, pods and services
make cluster-down     # terraform destroy
```

On a fresh cluster, run `make images` right after `make cluster-up`; until the images are loaded
the demo pods sit in `ErrImagePull`/`ImagePullBackOff` and the `demo` application shows `Progressing`.

After rebuilding an image under the same `dev` tag, restart its deployment to pick it up:

```bash
make images
kubectl -n demo rollout restart deployment/orders
```

| Variable                | Default                                  | Description                               |
| ----------------------- | ---------------------------------------- | ----------------------------------------- |
| `argocd_namespace`      | `argocd`                                 | Namespace Argo CD is installed into       |
| `argocd_chart_version`  | `10.18.0`                                | argo-cd chart version                     |
| `root_app_manifest_url` | `bootstrap/root-app.yaml` on GitHub raw  | Root Application applied after install    |
