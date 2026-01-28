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
    DependsOn?: string | string[];
}

// model/graph-models.ts (o donde tengas tus modelos)
export interface GraphData {
    nodes: GraphNode[];
    edges: GraphEdge[];
}

export interface GraphNode {
    data: {
        id: string;
        label: string;
        type: string;
        parent?: string;
        [key: string]: any;
    };
}

export interface GraphEdge {
    data: {
        id: string;
        source: string;
        target: string;
        [key: string]: any;
    };
}