resource "kind_cluster" "this" {
  name           = var.cluster_name
  node_image     = var.node_image
  wait_for_ready = true

  kind_config {
    kind        = "Cluster"
    api_version = "kind.x-k8s.io/v1alpha4"

    node {
      role = "control-plane"

      # Lets an ingress controller / gateway pin itself to this node.
      kubeadm_config_patches = [
        <<-EOT
        kind: InitConfiguration
        nodeRegistration:
          kubeletExtraArgs:
            node-labels: "ingress-ready=true"
        EOT
      ]

      extra_port_mappings {
        container_port = 80
        host_port      = var.http_host_port
        listen_address = var.listen_address
        protocol       = "TCP"
      }

      extra_port_mappings {
        container_port = 443
        host_port      = var.https_host_port
        listen_address = var.listen_address
        protocol       = "TCP"
      }
    }

    dynamic "node" {
      for_each = range(var.worker_count)

      content {
        role = "worker"
      }
    }
  }
}
