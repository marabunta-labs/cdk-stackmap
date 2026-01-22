// Interfaces para el tree.json
export interface TreeArtifact {
    id: string;
    path: string;
    children?: { [key: string]: TreeArtifact };
    attributes?: { [key: string]: any };
    constructInfo?: { fqn: string; version: string };
}

// Interfaces para el template.json
export interface CfnTemplate {
    Resources: { [logicalId: string]: CfnResource };
}

export interface CfnResource {
    Type: string;
    Properties: any;
}