interface CyNode {
    data: { id: string; label: string; type: string; parent?: string }; // Añadimos 'parent'
}

interface CyEdge {
    data: { id: string; source: string; target: string };
}

export interface GraphData {
    nodes: CyNode[];
    edges: CyEdge[];
}

export function parseCloudFormation(templateObj: any, stackName: string): GraphData {
    const nodes: CyNode[] = [];
    const edges: CyEdge[] = [];
    
    // 1. Crear el nodo "Padre" (El Stack) que contendrá a los demás
    // Esto hará que visualmente se vea una caja agrupando los recursos
    nodes.push({
        data: {
            id: stackName,
            label: stackName,
            type: 'Stack'
        }
    });

    if (!templateObj.Resources) {
        return { nodes, edges };
    }

    const resources = templateObj.Resources;

    for (const [logicalId, resource] of Object.entries(resources)) {
        const res = resource as any;
        const type = res.Type || "Unknown";
        const shortType = type.split('::').pop(); 
        
        // 2. Crear el nodo Recurso asignándole su 'parent'
        nodes.push({
            data: {
                id: logicalId,
                label: logicalId,
                type: shortType,
                parent: stackName // <--- LA CLAVE: Esto lo mete dentro de la caja del stack
            }
        });

        if (res.Properties) {
            findReferences(logicalId, res.Properties, edges);
        }
    }

    return { nodes, edges };
}

function findReferences(sourceId: string, obj: any, edges: CyEdge[]) {
    if (!obj || typeof obj !== 'object') return;

    if (obj.Ref) {
        const targetId = obj.Ref;
        if (!targetId.startsWith('AWS::')) {
             edges.push({
                data: {
                    id: `${sourceId}->${targetId}`,
                    source: sourceId,
                    target: targetId
                }
            });
        }
        return;
    }

    for (const key in obj) {
        findReferences(sourceId, obj[key], edges);
    }
}