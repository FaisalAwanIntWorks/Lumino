# Requirements Document

## Introduction

This document defines the requirements for a single AWS CloudFormation template that deploys infrastructure for hosting a React single-page application on an EC2 instance running Ubuntu 22.04 with Nginx. The architecture is intentionally simple: a VPC with a public subnet, an EC2 instance serving static files via Nginx, an Elastic IP for stable DNS pointing, and Secrets Manager for Supabase credentials. SSL is handled manually by the user uploading their own certificate files. The user deploys the React build and configures SSL outside of CloudFormation.

Architecture flow: Domain → EC2 (Ubuntu Server) → Nginx → React build (static files) → SSL (user's own certificate)

## Glossary

- **CloudFormation_Template**: The AWS CloudFormation YAML template file that defines all AWS infrastructure resources for the deployment
- **EC2_Instance**: An Amazon EC2 instance (t2.micro, Ubuntu 22.04) that runs Nginx to serve the React static build files
- **EC2_Security_Group**: A VPC security group attached to the EC2_Instance controlling inbound and outbound network traffic
- **Elastic_IP**: An AWS Elastic IP address associated with the EC2_Instance providing a stable public IP for DNS pointing at the user's domain registrar
- **VPC**: An Amazon Virtual Private Cloud providing the isolated network environment for the EC2_Instance
- **Public_Subnet**: A subnet within the VPC with a route to an Internet Gateway, enabling the EC2_Instance to receive public traffic
- **Internet_Gateway**: An AWS Internet Gateway attached to the VPC enabling internet connectivity for the Public_Subnet
- **Route_Table**: A VPC route table associated with the Public_Subnet containing a default route to the Internet_Gateway
- **IAM_Instance_Profile**: An IAM instance profile attached to the EC2_Instance granting permission to read the Supabase_Secret from Secrets Manager
- **Supabase_Secret**: An AWS Secrets Manager secret that stores the Supabase URL and Supabase anon key
- **UserData_Script**: A bash script executed on EC2_Instance first boot that installs Nginx, configures it for SPA static file serving, enables UFW firewall, and hardens SSH
- **Stack_Outputs**: The CloudFormation stack output values exported after deployment for reference

## Requirements

### Requirement 1: VPC and Networking

**User Story:** As a developer, I want a VPC with a public subnet and internet gateway, so that the EC2 instance has a secure, isolated network with public internet access.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL create a VPC with a /16 CIDR block
2. THE CloudFormation_Template SHALL create a Public_Subnet within the VPC with a /24 CIDR block and auto-assign public IP enabled
3. THE CloudFormation_Template SHALL create an Internet_Gateway and attach it to the VPC
4. THE CloudFormation_Template SHALL create a Route_Table associated with the Public_Subnet containing a default route (0.0.0.0/0) to the Internet_Gateway
5. THE CloudFormation_Template SHALL tag all VPC networking resources with the environment name and project identifier

### Requirement 2: EC2 Instance with Nginx Bootstrap

**User Story:** As a developer, I want an EC2 instance running Ubuntu 22.04 that automatically installs and configures Nginx on first boot, so that the server is ready to serve my React static build files immediately after stack creation.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL create an EC2_Instance of type t2.micro (free tier eligible) in the Public_Subnet
2. THE EC2_Instance SHALL use an Ubuntu 22.04 LTS AMI
3. THE UserData_Script SHALL run apt update and install Nginx
4. THE UserData_Script SHALL create the /var/www/html directory structure for serving static files
5. THE UserData_Script SHALL configure Nginx to serve static files from /var/www/html with a try_files directive routing all unmatched paths to /index.html for SPA routing
6. THE UserData_Script SHALL configure Nginx to listen on port 80
7. THE UserData_Script SHALL enable and start the Nginx service
8. THE UserData_Script SHALL enable UFW firewall allowing Nginx Full (ports 80 and 443) and SSH (port 22)
9. THE UserData_Script SHALL disable password authentication for SSH by setting PasswordAuthentication to no in the sshd configuration, enforcing key-only access
10. THE CloudFormation_Template SHALL accept a parameter for the EC2 key pair name to enable SSH access
11. THE CloudFormation_Template SHALL accept a parameter for the allowed SSH CIDR block
12. THE EC2_Instance SHALL be associated with the IAM_Instance_Profile for Secrets Manager access
13. THE EC2_Instance SHALL be associated with the EC2_Security_Group

### Requirement 3: EC2 Security Group

**User Story:** As a developer, I want a security group that restricts inbound traffic to HTTP, HTTPS, and SSH from authorized sources, so that the EC2 instance is protected from unauthorized network access.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL create an EC2_Security_Group within the VPC
2. THE EC2_Security_Group SHALL allow inbound HTTP traffic on port 80 from any source (0.0.0.0/0)
3. THE EC2_Security_Group SHALL allow inbound HTTPS traffic on port 443 from any source (0.0.0.0/0)
4. THE EC2_Security_Group SHALL allow inbound SSH traffic on port 22 only from the specified SSH CIDR parameter
5. THE EC2_Security_Group SHALL allow all outbound traffic to enable package installation and external API calls

### Requirement 4: Elastic IP

**User Story:** As a developer, I want an Elastic IP associated with the EC2 instance, so that the instance has a stable public IP address that I can point my domain to at my domain registrar.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL create an Elastic_IP
2. THE Elastic_IP SHALL be associated with the EC2_Instance
3. WHEN the CloudFormation stack is deleted, THE Elastic_IP SHALL be released by default to avoid orphaned cost

### Requirement 5: IAM Instance Profile for Secrets Manager Access

**User Story:** As a developer, I want the EC2 instance to have an IAM role with permission to read the Supabase secret, so that the application can securely retrieve database credentials at runtime without hardcoding them.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL create an IAM role with a trust policy allowing the EC2 service to assume the role
2. THE IAM role SHALL have a policy granting secretsmanager:GetSecretValue permission scoped to the Supabase_Secret resource ARN only
3. THE CloudFormation_Template SHALL create an IAM_Instance_Profile referencing the IAM role
4. THE IAM_Instance_Profile SHALL be attached to the EC2_Instance

### Requirement 6: Supabase Credentials Management

**User Story:** As a developer, I want the Supabase connection credentials stored securely in AWS Secrets Manager, so that sensitive database connection details are not hardcoded or exposed.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL accept the Supabase URL and Supabase anon key as input parameters with the NoEcho property set to true
2. THE CloudFormation_Template SHALL create a Supabase_Secret containing the Supabase URL and Supabase anon key
3. THE Supabase_Secret SHALL use AWS managed encryption (aws/secretsmanager KMS key)
4. WHEN the CloudFormation stack is deleted, THE Supabase_Secret SHALL be retained by setting the DeletionPolicy to Retain

### Requirement 7: CloudFormation Template Parameters and Outputs

**User Story:** As a developer, I want clear input parameters and stack outputs, so that I can easily configure and reference the deployed infrastructure.

#### Acceptance Criteria

1. THE CloudFormation_Template SHALL accept a parameter for the environment name (e.g., "production", "staging") to tag and namespace resources
2. THE CloudFormation_Template SHALL accept NoEcho parameters for the Supabase URL and Supabase anon key
3. THE CloudFormation_Template SHALL accept a parameter for the EC2 SSH key pair name
4. THE CloudFormation_Template SHALL accept a parameter for the allowed SSH CIDR block
5. THE CloudFormation_Template SHALL accept a parameter for the domain name (used for documentation and tagging purposes)
6. THE Stack_Outputs SHALL include the Elastic_IP public address (the EC2 public IP)
7. THE Stack_Outputs SHALL include the EC2_Instance instance ID
8. THE Stack_Outputs SHALL include the Supabase_Secret ARN for application reference
9. THE Stack_Outputs SHALL include the VPC ID
10. THE CloudFormation_Template SHALL tag all taggable resources with the environment name and a project identifier

### Requirement 8: CloudFormation Stack Protection

**User Story:** As a developer, I want termination protection guidance and deletion policies on critical resources, so that important data is protected from accidental deletion.

#### Acceptance Criteria

1. THE CloudFormation_Template description SHALL instruct the deployer to enable termination protection on the stack after creation
2. THE CloudFormation_Template SHALL include a Metadata section documenting the recommended stack policy that prevents Update:Replace and Update:Delete actions on the EC2_Instance and Supabase_Secret resources
3. THE CloudFormation_Template Metadata SHALL include the AWS CLI command to apply the stack policy after stack creation
4. THE CloudFormation_Template SHALL set DeletionPolicy to Retain on the Supabase_Secret to protect credentials even if the stack is deleted

### Requirement 9: Security Hardening

**User Story:** As a developer, I want the EC2 instance hardened with firewall rules, key-only SSH, and a prepared SSL directory, so that the server follows security best practices from initial deployment.

#### Acceptance Criteria

1. THE UserData_Script SHALL disable password-based SSH authentication and enforce key-only access
2. THE UserData_Script SHALL enable UFW firewall with rules allowing only Nginx Full (ports 80 and 443) and SSH (port 22)
3. THE UserData_Script SHALL configure Nginx with secure defaults (disable server_tokens to hide version information)
4. THE UserData_Script SHALL create the /etc/ssl/myapp directory for the user to upload their own SSL certificate files after deployment
5. THE UserData_Script SHALL set appropriate ownership and permissions on the /etc/ssl/myapp directory (root-owned, 700 permissions)
