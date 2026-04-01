#!/usr/bin/env node
import * as cdk from "aws-cdk-lib/core";
import { SweaasStack } from "../lib/sweaas-stack";

const app = new cdk.App();

new SweaasStack(app, "Sweaas", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT ?? "802528391167",
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  domainName: "sweaas.com",
});

app.synth();
