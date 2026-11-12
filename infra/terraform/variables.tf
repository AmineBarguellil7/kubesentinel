variable "cluster_name" {
  description = "Name of the kind cluster. The kubeconfig context becomes kind-<cluster_name>."
  type        = string
  default     = "kubesentinel"
}

variable "worker_count" {
  description = "Number of worker nodes."
  type        = number
  default     = 2

  validation {
    condition     = var.worker_count >= 0 && floor(var.worker_count) == var.worker_count
    error_message = "worker_count must be a non-negative integer."
  }
}

variable "node_image" {
  description = "kindest/node image for all nodes (e.g. kindest/node:v1.33.1). Null uses the provider's default."
  type        = string
  default     = null
}

variable "http_host_port" {
  description = "Host port forwarded to port 80 on the control-plane node."
  type        = number
  default     = 8080
}

variable "https_host_port" {
  description = "Host port forwarded to port 443 on the control-plane node."
  type        = number
  default     = 8443
}

variable "listen_address" {
  description = "Host address the forwarded ports bind to. Use 0.0.0.0 to expose them beyond localhost."
  type        = string
  default     = "127.0.0.1"
}
