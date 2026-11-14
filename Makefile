CLUSTER   ?= kubesentinel
CONTEXT   := kind-$(CLUSTER)
NAMESPACE := demo
TAG       ?= dev
SERVICES  := payments orders api
TF_DIR    := infra/terraform
KUBECTL   := kubectl --context $(CONTEXT)

.DEFAULT_GOAL := help
.PHONY: help cluster-up images deploy status cluster-down

help: ## List the available targets
	@grep -E '^[a-z-]+:.*## ' $(MAKEFILE_LIST) | awk -F ':.*## ' '{printf "  %-14s %s\n", $$1, $$2}'

cluster-up: ## Create the kind cluster with Terraform
	terraform -chdir=$(TF_DIR) init -input=false
	terraform -chdir=$(TF_DIR) apply -auto-approve -input=false -var cluster_name=$(CLUSTER)

images: ## Build the demo images and load them into the kind nodes
	@for svc in $(SERVICES); do \
		set -e; \
		image=kubesentinel-demo-$$svc:$(TAG); \
		echo "==> $$image"; \
		docker build -t $$image services/demo-$$svc; \
		kind load docker-image $$image --name $(CLUSTER); \
	done

deploy: ## Apply the demo manifests and wait for the rollouts
	$(KUBECTL) apply -k k8s/demo
	@for d in redis $(SERVICES); do \
		$(KUBECTL) -n $(NAMESPACE) rollout status deployment/$$d --timeout=180s || exit 1; \
	done

status: ## Show nodes, pods and services
	$(KUBECTL) get nodes
	$(KUBECTL) -n $(NAMESPACE) get deployments,pods,services -o wide

cluster-down: ## Destroy the kind cluster
	terraform -chdir=$(TF_DIR) destroy -auto-approve -input=false -var cluster_name=$(CLUSTER)
