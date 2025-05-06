import neo4j, { Driver, Session, Record } from 'neo4j-driver';
import dotenv from 'dotenv';

dotenv.config();

class DatabaseMigrator {
    private stagingDriver: Driver;
    private productionDriver: Driver;

    constructor() {
        // Initialize staging driver
        this.stagingDriver = neo4j.driver(
            process.env.STAGING_NEO4J_URI as string,
            neo4j.auth.basic(
                process.env.STAGING_NEO4J_USER || 'neo4j',
                process.env.STAGING_NEO4J_PASSWORD as string
            )
        );

        // Initialize production driver
        this.productionDriver = neo4j.driver(
            process.env.PRODUCTION_NEO4J_URI as string,
            neo4j.auth.basic(
                process.env.PRODUCTION_NEO4J_USER || 'neo4j',
                process.env.PRODUCTION_NEO4J_PASSWORD as string
            )
        );
    }

    // Fetch nodes of a specific label from staging
    private async fetchNodesFromStaging(session: Session, label: string): Promise<any[]> {
        try {
            const result = await session.run(`MATCH (n:${label}) RETURN n`);
            const nodes = result.records.map(record => ({
                ...record.get('n').properties,
                labels: record.get('n').labels
            }));
            return nodes.filter(node => node && Object.keys(node).length > 0); // Skip empty nodes
        } catch (error) {
            console.error(`Error fetching ${label} nodes from staging:`, error);
            return [];
        }
    }

    // Fetch relationships involving nodes of a specific label from staging
    private async fetchRelationshipsFromStaging(session: Session, label: string): Promise<any[]> {
        try {
            const result = await session.run(`
                MATCH (source:${label})-[r]->(target)
                RETURN source, type(r) AS relType, properties(r) AS relProps, target
            `);
            const relationships = result.records.map(record => ({
                source: {
                    ...record.get('source').properties,
                    labels: record.get('source').labels
                },
                relType: record.get('relType'),
                relProps: record.get('relProps'),
                target: {
                    ...record.get('target').properties,
                    labels: record.get('target').labels
                }
            }));
            return relationships;
        } catch (error) {
            console.error(`Error fetching relationships for ${label} from staging:`, error);
            return [];
        }
    }

    // Create or merge a single node in production
    private async ensureNodeInProduction(session: Session, node: any, label: string): Promise<void> {
        try {
            if (!node || Object.keys(node).length === 0) {
                console.warn(`Skipping empty ${label} node`);
                return;
            }

            // Assume 'id' or 'title' as unique identifier; fallback to first property
            const uniqueKey = node.id ? 'id' : node.title ? 'title' : Object.keys(node)[0];
            const properties = Object.keys(node)
                .map(key => `${key}: $${key}`)
                .join(', ');

            // Use MERGE to avoid duplicates based on uniqueKey
            const query = `
                MERGE (n:${label} {${uniqueKey}: $${uniqueKey}})
                SET n += {${properties}}
                RETURN n
            `;
            await session.run(query, node);
            console.log(`Ensured ${label} node: ${node.title || node.id || 'unnamed'}`);
        } catch (error) {
            console.error(`Error ensuring ${label} node: ${node.title || node.id || 'unnamed'}:`, error);
        }
    }

    // Create nodes in production
    private async loadNodesIntoProduction(session: Session, label: string, nodes: any[]): Promise<number> {
        let successCount = 0;
        for (const node of nodes) {
            await this.ensureNodeInProduction(session, node, label);
            successCount++;
        }
        return successCount;
    }

    // Create relationships in production
    private async loadRelationshipsIntoProduction(session: Session, relationships: any[]): Promise<number> {
        let successCount = 0;
        for (const rel of relationships) {
            try {
                const sourceLabel = rel.source.labels[0]; // Primary label of source
                const targetLabel = rel.target.labels[0]; // Primary label of target

                // Ensure source and target nodes exist
                await this.ensureNodeInProduction(session, rel.source, sourceLabel);
                await this.ensureNodeInProduction(session, rel.target, targetLabel);

                // Build relationship properties
                const relProps = rel.relProps && Object.keys(rel.relProps).length > 0
                    ? Object.keys(rel.relProps)
                        .map(key => `${key}: $relProps.${key}`)
                        .join(', ')
                    : '';

                // Create relationship
                const uniqueSourceKey = rel.source.id ? 'id' : rel.source.title ? 'title' : Object.keys(rel.source)[0];
                const uniqueTargetKey = rel.target.id ? 'id' : rel.target.title ? 'title' : Object.keys(rel.target)[0];

                const query = `
                    MATCH (source:${sourceLabel} {${uniqueSourceKey}: $source.${uniqueSourceKey}})
                    MATCH (target:${targetLabel} {${uniqueTargetKey}: $target.${uniqueTargetKey}})
                    MERGE (source)-[r:${rel.relType} {${relProps}}]->(target)
                    RETURN r
                `;
                await session.run(query, {
                    source: rel.source,
                    target: rel.target,
                    relProps: rel.relProps || {}
                });
                successCount++;
                console.log(`Created relationship ${rel.relType} from ${sourceLabel} to ${targetLabel}`);
            } catch (error) {
                console.error(`Error creating relationship ${rel.relType}:`, error);
            }
        }
        return successCount;
    }

    // Main migration process for nodes and relationships
    public async migrateNodesAndRelationships(label: string) {
        let stagingSession: Session | null = null;
        let productionSession: Session | null = null;

        try {
            stagingSession = this.stagingDriver.session();
            productionSession = this.productionDriver.session();

            // Migrate nodes
            console.log(`Fetching ${label} nodes from staging...`);
            const nodes = await this.fetchNodesFromStaging(stagingSession, label);
            console.log(`Fetched ${nodes.length} ${label} nodes from staging.`);

            if (nodes.length > 0) {
                console.log(`Creating ${label} nodes in production...`);
                const nodeSuccessCount = await this.loadNodesIntoProduction(productionSession, label, nodes);
                console.log(`Successfully created ${nodeSuccessCount} of ${nodes.length} ${label} nodes in production.`);
            } else {
                console.log(`No ${label} nodes to migrate.`);
            }

            // Migrate relationships
            console.log(`Fetching relationships for ${label} from staging...`);
            const relationships = await this.fetchRelationshipsFromStaging(stagingSession, label);
            console.log(`Fetched ${relationships.length} relationships for ${label} from staging.`);

            if (relationships.length > 0) {
                console.log(`Creating relationships in production...`);
                const relSuccessCount = await this.loadRelationshipsIntoProduction(productionSession, relationships);
                console.log(`Successfully created ${relSuccessCount} of ${relationships.length} relationships in production.`);
            } else {
                console.log(`No relationships for ${label} to migrate.`);
            }
        } catch (error) {
            console.error('Migration failed:', error);
        } finally {
            // Safely close sessions
            if (stagingSession) {
                await stagingSession.close().catch(err => console.error('Error closing staging session:', err));
            }
            if (productionSession) {
                await productionSession.close().catch(err => console.error('Error closing production session:', err));
            }
            // Safely close drivers
            await this.stagingDriver.close().catch(err => console.error('Error closing staging driver:', err));
            await this.productionDriver.close().catch(err => console.error('Error closing production driver:', err));
        }
    }
}

// Execute migration
const migrator = new DatabaseMigrator();
migrator.migrateNodesAndRelationships('ProblemStatement').then(() => {
    console.log('Migration process completed.');
}).catch(error => {
    console.error('Migration process failed:', error);
    process.exit(1);
});