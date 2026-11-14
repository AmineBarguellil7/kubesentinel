output "cluster_name" {
  description = "Name of the kind cluster."
  value       = kind_cluster.this.name
}

output "kubeconfig_context" {
  description = "kubectl context name for the cluster."
  value       = "kind-${kind_cluster.this.name}"
}

output "kubeconfig_path" {
  description = "Path of the kubeconfig file the cluster credentials were written to."
  value       = kind_cluster.this.kubeconfig_path
}

output "endpoint" {
  description = "Kubernetes API server endpoint."
  value       = kind_cluster.this.endpoint
}

output "argocd_namespace" {
  description = "Namespace Argo CD runs in."
  value       = helm_release.argocd.namespace
}

output "argocd_chart_version" {
  description = "Installed argo-cd chart version."
  value       = helm_release.argocd.version
}
