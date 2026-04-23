import * as cdk from "aws-cdk-lib/core";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import * as rds from "aws-cdk-lib/aws-rds";
import * as elasticache from "aws-cdk-lib/aws-elasticache";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as servicediscovery from "aws-cdk-lib/aws-servicediscovery";
import { Construct } from "constructs";

interface SweaasStackProps extends cdk.StackProps {
  domainName: string;
}

export class SweaasStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SweaasStackProps) {
    super(scope, id, props);

    const { domainName } = props;

    // ════════════════════════════════════════════
    //  VPC
    // ════════════════════════════════════════════

    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { cidrMask: 24, name: "Public", subnetType: ec2.SubnetType.PUBLIC },
        {
          cidrMask: 24,
          name: "Private",
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
        },
        {
          cidrMask: 24,
          name: "Isolated",
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // ════════════════════════════════════════════
    //  DNS + TLS
    // ════════════════════════════════════════════

    const hostedZone = new route53.PublicHostedZone(this, "HostedZone", {
      zoneName: domainName,
    });

    const certificate = new acm.Certificate(this, "Cert", {
      domainName,
      subjectAlternativeNames: [`*.${domainName}`],
      validation: acm.CertificateValidation.fromDns(hostedZone),
    });

    // ════════════════════════════════════════════
    //  Security Groups
    // ════════════════════════════════════════════

    const backendSg = new ec2.SecurityGroup(this, "BackendSg", {
      vpc,
      description: "Backend Fargate",
      allowAllOutbound: true,
    });

    const chromaSg = new ec2.SecurityGroup(this, "ChromaSg", {
      vpc,
      description: "ChromaDB Fargate",
      allowAllOutbound: true,
    });

    const dbSg = new ec2.SecurityGroup(this, "DbSg", {
      vpc,
      description: "RDS PostgreSQL",
      allowAllOutbound: false,
    });

    const redisSg = new ec2.SecurityGroup(this, "RedisSg", {
      vpc,
      description: "ElastiCache Redis",
      allowAllOutbound: false,
    });

    dbSg.addIngressRule(backendSg, ec2.Port.tcp(5432), "Backend to RDS");
    redisSg.addIngressRule(backendSg, ec2.Port.tcp(6379), "Backend to Redis");
    chromaSg.addIngressRule(
      backendSg,
      ec2.Port.tcp(8000),
      "Backend to Chroma"
    );

    // ════════════════════════════════════════════
    //  Secrets Manager
    // ════════════════════════════════════════════

    const appSecrets = new secretsmanager.Secret(this, "AppSecrets", {
      secretName: "sweaas/app-secrets",
      description: "SWEAAS API keys and tokens — populate after deploy",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({
          SUPABASE_URL: "",
          SUPABASE_PUBLISHABLE_KEY: "",
          SUPABASE_SECRET_KEY: "",
          OPENAI_API_KEY: "",
          ANTHROPIC_API_KEY: "",
          XAI_API_KEY: "",
          E2B_API_KEY: "",
          SENTRY_DSN: "",
          SENTRY_AUTH_TOKEN: "",
          STRIPE_SECRET_KEY: "",
          STRIPE_PUBLISHABLE_KEY: "",
          STRIPE_WEBHOOK_SECRET: "",
          AGENTMAIL_API_KEY: "",
          TAVUS_API_KEY: "",
          GITHUB_APP_ID: "",
          GITHUB_CLIENT_ID: "",
          GITHUB_WEBHOOK_SECRET: "",
          LANGCHAIN_API_KEY: "",
          FEEDBACK_WEBHOOK_URL: "",
          TWILIO_ACCOUNT_SID: "",
          TWILIO_AUTH_TOKEN: "",
          GOLPO_API_KEY: "",
          VAPI_PRIVATE_KEY: "",
          DEEPGRAM_API_KEY: "",
        }),
        generateStringKey: "_placeholder",
      },
    });

    // ════════════════════════════════════════════
    //  RDS PostgreSQL  (db.t4g.micro — free-tier eligible)
    // ════════════════════════════════════════════

    const dbInstance = new rds.DatabaseInstance(this, "Postgres", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16_4,
      }),
      instanceType: ec2.InstanceType.of(
        ec2.InstanceClass.T4G,
        ec2.InstanceSize.MICRO
      ),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [dbSg],
      databaseName: "sweaas",
      credentials: rds.Credentials.fromGeneratedSecret("sweaas_admin", {
        secretName: "sweaas/rds-credentials",
      }),
      allocatedStorage: 20,
      maxAllocatedStorage: 20,
      storageEncrypted: false,
      multiAz: false,
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT,
      deletionProtection: false,
      backupRetention: cdk.Duration.days(1),
    });

    // ════════════════════════════════════════════
    //  ElastiCache Redis (cache.t3.micro — free-tier eligible)
    // ════════════════════════════════════════════

    const isolatedSubnets = vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
    });

    const redisSubnetGroup = new elasticache.CfnSubnetGroup(
      this,
      "RedisSubnets",
      {
        description: "SWEAAS Redis subnets",
        subnetIds: isolatedSubnets.subnetIds,
        cacheSubnetGroupName: "sweaas-redis",
      }
    );

    const redis = new elasticache.CfnCacheCluster(this, "Redis", {
      engine: "redis",
      cacheNodeType: "cache.t3.micro",
      numCacheNodes: 1,
      clusterName: "sweaas-redis",
      vpcSecurityGroupIds: [redisSg.securityGroupId],
      cacheSubnetGroupName: redisSubnetGroup.cacheSubnetGroupName!,
      engineVersion: "7.1",
    });
    redis.addDependency(redisSubnetGroup);

    // ════════════════════════════════════════════
    //  ECR + ECS Cluster + Cloud Map
    // ════════════════════════════════════════════

    const ecrRepo = ecr.Repository.fromRepositoryName(
      this,
      "BackendRepo",
      "sweaas-backend"
    );

    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      clusterName: "sweaas",
      containerInsightsV2: ecs.ContainerInsights.DISABLED,
    });

    const namespace = new servicediscovery.PrivateDnsNamespace(
      this,
      "Namespace",
      { name: "sweaas.local", vpc }
    );

    // ════════════════════════════════════════════
    //  ChromaDB Fargate Service
    // ════════════════════════════════════════════

    const chromaTask = new ecs.FargateTaskDefinition(this, "ChromaTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
    });
    chromaTask.addContainer("chromadb", {
      image: ecs.ContainerImage.fromRegistry("chromadb/chroma:latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "chromadb",
        logGroup: new logs.LogGroup(this, "ChromaLogs", {
          logGroupName: "/ecs/sweaas-chromadb",
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: { ANONYMIZED_TELEMETRY: "false" },
      portMappings: [{ containerPort: 8000 }],
    });

    new ecs.FargateService(this, "ChromaSvc", {
      cluster,
      taskDefinition: chromaTask,
      desiredCount: 1,
      securityGroups: [chromaSg],
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      cloudMapOptions: {
        name: "chromadb",
        cloudMapNamespace: namespace,
        dnsRecordType: servicediscovery.DnsRecordType.A,
      },
      serviceName: "chromadb",
    });

    // ════════════════════════════════════════════
    //  ALB  (api.sweaas.com)
    // ════════════════════════════════════════════

    const alb = new elbv2.ApplicationLoadBalancer(this, "Alb", {
      vpc,
      internetFacing: true,
      loadBalancerName: "sweaas-api",
    });

    const httpsListener = alb.addListener("Https", {
      port: 443,
      protocol: elbv2.ApplicationProtocol.HTTPS,
      certificates: [certificate],
    });

    alb.addListener("HttpRedirect", {
      port: 80,
      defaultAction: elbv2.ListenerAction.redirect({
        protocol: "HTTPS",
        port: "443",
        permanent: true,
      }),
    });

    new route53.ARecord(this, "ApiAlias", {
      zone: hostedZone,
      recordName: `api.${domainName}`,
      target: route53.RecordTarget.fromAlias(
        new route53targets.LoadBalancerTarget(alb)
      ),
    });

    // ════════════════════════════════════════════
    //  Backend Fargate Service
    // ════════════════════════════════════════════

    const backendTask = new ecs.FargateTaskDefinition(this, "BackendTask", {
      cpu: 512,
      memoryLimitMiB: 1024,
    });

    dbInstance.secret?.grantRead(backendTask.taskRole);
    appSecrets.grantRead(backendTask.taskRole);

    const redisEndpoint = `redis://${redis.attrRedisEndpointAddress}:${redis.attrRedisEndpointPort}`;

    backendTask.addContainer("backend", {
      image: ecs.ContainerImage.fromEcrRepository(ecrRepo, "latest"),
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "backend",
        logGroup: new logs.LogGroup(this, "BackendLogs", {
          logGroupName: "/ecs/sweaas-backend",
          retention: logs.RetentionDays.TWO_WEEKS,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
      }),
      environment: {
        APP_NAME: "SWEAAS Backend",
        APP_VERSION: "0.1.0",
        API_PREFIX: "/api/v1",
        ENVIRONMENT: "production",
        // Production: only our own origins. Local dev uses localhost via the
        // Vite proxy and never reaches the prod ALB, so no localhost entry.
        CORS_ORIGINS: [
          `https://${domainName}`,
          `https://www.${domainName}`,
        ].join(","),
        // Require Supabase JWT in production. The backend refuses to start
        // if SUPABASE_URL is empty — those values come from appSecrets below.
        AUTH_ENFORCE_JWT: "true",
        CHROMA_HOST: "chromadb.sweaas.local",
        CHROMA_PORT: "8000",
        REDIS_URL: redisEndpoint,
        LANGCHAIN_TRACING_V2: "true",
        LANGCHAIN_PROJECT: "sweaas",
        DATABASE_POOL_SIZE: "20",
        LLM_DEFAULT_MODEL: "xai/grok-4-1-fast-reasoning",
        SENTRY_ORG: "sweaas",
        SENTRY_PROJECT: "sweaas",
        SENTRY_TEAM: "sweaas",
        GITHUB_ORG_NAME: "SWEAAS",
        GITHUB_APP_PRIVATE_KEY_PATH: "/app/backend/github-app-key.pem",
      },
      // Pull vendor API keys out of Secrets Manager (JSON-structured secret).
      // Populate the actual values via the AWS console or `aws secretsmanager
      // put-secret-value --secret-id sweaas/app-secrets --secret-string '{...}'`
      // before running `cdk deploy` — an empty SUPABASE_URL with
      // AUTH_ENFORCE_JWT=true will cause the task to exit on startup.
      secrets: {
        SUPABASE_URL: ecs.Secret.fromSecretsManager(appSecrets, "SUPABASE_URL"),
        SUPABASE_PUBLISHABLE_KEY: ecs.Secret.fromSecretsManager(appSecrets, "SUPABASE_PUBLISHABLE_KEY"),
        SUPABASE_SECRET_KEY: ecs.Secret.fromSecretsManager(appSecrets, "SUPABASE_SECRET_KEY"),
        OPENAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "OPENAI_API_KEY"),
        ANTHROPIC_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "ANTHROPIC_API_KEY"),
        XAI_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "XAI_API_KEY"),
        E2B_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "E2B_API_KEY"),
        SENTRY_DSN: ecs.Secret.fromSecretsManager(appSecrets, "SENTRY_DSN"),
        SENTRY_AUTH_TOKEN: ecs.Secret.fromSecretsManager(appSecrets, "SENTRY_AUTH_TOKEN"),
        STRIPE_SECRET_KEY: ecs.Secret.fromSecretsManager(appSecrets, "STRIPE_SECRET_KEY"),
        STRIPE_PUBLISHABLE_KEY: ecs.Secret.fromSecretsManager(appSecrets, "STRIPE_PUBLISHABLE_KEY"),
        STRIPE_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(appSecrets, "STRIPE_WEBHOOK_SECRET"),
        AGENTMAIL_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "AGENTMAIL_API_KEY"),
        TAVUS_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "TAVUS_API_KEY"),
        GITHUB_APP_ID: ecs.Secret.fromSecretsManager(appSecrets, "GITHUB_APP_ID"),
        GITHUB_CLIENT_ID: ecs.Secret.fromSecretsManager(appSecrets, "GITHUB_CLIENT_ID"),
        GITHUB_WEBHOOK_SECRET: ecs.Secret.fromSecretsManager(appSecrets, "GITHUB_WEBHOOK_SECRET"),
        LANGCHAIN_API_KEY: ecs.Secret.fromSecretsManager(appSecrets, "LANGCHAIN_API_KEY"),
        FEEDBACK_WEBHOOK_URL: ecs.Secret.fromSecretsManager(appSecrets, "FEEDBACK_WEBHOOK_URL"),
      },
      portMappings: [{ containerPort: 8000 }],
      healthCheck: {
        command: [
          "CMD-SHELL",
          'python -c "import urllib.request; urllib.request.urlopen(\'http://localhost:8000/api/v1/health\')" || exit 1',
        ],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(90),
      },
    });

    const backendSvc = new ecs.FargateService(this, "BackendSvc", {
      cluster,
      taskDefinition: backendTask,
      desiredCount: 1,
      securityGroups: [backendSg],
      assignPublicIp: false,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      serviceName: "backend",
    });

    httpsListener.addTargets("BackendTg", {
      port: 8000,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targets: [backendSvc],
      healthCheck: {
        path: "/api/v1/health",
        interval: cdk.Duration.seconds(30),
        healthyThresholdCount: 2,
        unhealthyThresholdCount: 3,
      },
    });

    // ════════════════════════════════════════════
    //  Outputs
    // ════════════════════════════════════════════

    new cdk.CfnOutput(this, "NameServers", {
      value: cdk.Fn.join(", ", hostedZone.hostedZoneNameServers!),
      description: "Set these as Custom DNS in Namecheap",
    });
    new cdk.CfnOutput(this, "CertArn", { value: certificate.certificateArn });
    new cdk.CfnOutput(this, "AlbDns", { value: alb.loadBalancerDnsName });
    new cdk.CfnOutput(this, "ApiUrl", {
      value: `https://api.${domainName}/api/v1`,
    });
    new cdk.CfnOutput(this, "EcrUri", { value: ecrRepo.repositoryUri });
    new cdk.CfnOutput(this, "ClusterName", { value: cluster.clusterName });
    new cdk.CfnOutput(this, "RdsEndpoint", {
      value: dbInstance.dbInstanceEndpointAddress,
    });
    new cdk.CfnOutput(this, "RdsSecretArn", {
      value: dbInstance.secret?.secretArn ?? "N/A",
    });
    new cdk.CfnOutput(this, "RedisEndpoint", { value: redisEndpoint });
    new cdk.CfnOutput(this, "AppSecretsArn", {
      value: appSecrets.secretArn,
    });
  }
}
