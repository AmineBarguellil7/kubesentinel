resource "helm_release" "argocd" {
  name             = "argocd"
  repository       = "https://argoproj.github.io/argo-helm"
  chart            = "argo-cd"
  version          = var.argocd_chart_version
  namespace        = var.argocd_namespace
  create_namespace = true
  wait             = true
  timeout          = 600

  values = [file("${path.module}/argocd-values.yaml")]
}

# The root Application ("app of apps") lives in the GitOps repo and is applied from there,
# so its definition is not duplicated here. From then on Argo CD manages everything under apps/.
#
# kubectl is used instead of a kubernetes_manifest resource because that resource needs the
# Application CRD to exist at plan time, which it does not on a fresh cluster.
resource "terraform_data" "root_app" {
  triggers_replace = {
    manifest_url = var.root_app_manifest_url
    argocd       = helm_release.argocd.id
  }

  provisioner "local-exec" {
    command = "kubectl --kubeconfig \"$KUBECONFIG_PATH\" apply -n \"$ARGOCD_NAMESPACE\" -f \"$MANIFEST_URL\""

    environment = {
      KUBECONFIG_PATH  = kind_cluster.this.kubeconfig_path
      ARGOCD_NAMESPACE = var.argocd_namespace
      MANIFEST_URL     = var.root_app_manifest_url
    }
  }
}
