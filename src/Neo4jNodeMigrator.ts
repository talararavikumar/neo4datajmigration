import neo4j, { Driver, Session } from 'neo4j-driver';
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
        const nodes = result.records.map(record => record.get('n').properties);
        return nodes.filter(node => node && Object.keys(node).length > 0); // Skip empty nodes
      } catch (error) {
        console.error(`Error fetching ${label} nodes from staging:`, error);
        return [];
      }
    }
  
    // Create nodes in production
    private async loadNodesIntoProduction(session: Session, label: string, nodes: any[]): Promise<number> {
      let successCount = 0;
      for (const node of nodes) {
        try {
          // Skip nodes with no properties
          if (!node || Object.keys(node).length === 0) {
            console.warn(`Skipping empty ${label} node`);
            continue;
          }
  
          // Build dynamic property list for CREATE
          const properties = Object.keys(node)
            .map(key => `${key}: $${key}`)
            .join(', ');
  
          const query = `CREATE (n:${label} {${properties}}) RETURN n`;
          await session.run(query, node);
          successCount++;
          console.log(`Created ${label} node: ${node.title || 'unnamed'}`);
        } catch (error) {
          console.error(`Error creating ${label} node: ${node.title || 'unnamed'}:`, error);
        }
      }
      return successCount;
    }
  
    // Main migration process
    public async migrateNodes(label: string) {
      let stagingSession: Session | null = null;
      let productionSession: Session | null = null;
  
      try {
        stagingSession = this.stagingDriver.session();
        productionSession = this.productionDriver.session();
  
        console.log(`Fetching ${label} nodes from staging...`);
        const nodes = await this.fetchNodesFromStaging(stagingSession, label);
        console.log(`Fetched ${nodes.length} ${label} nodes from staging.`);
  
        if (nodes.length === 0) {
          console.log(`No ${label} nodes to migrate.`);
          return;
        }
  
        console.log(`Creating ${label} nodes in production...`);
        const successCount = await this.loadNodesIntoProduction(productionSession, label, nodes);
        console.log(`Successfully created ${successCount} of ${nodes.length} ${label} nodes in production.`);
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
  
  const migrator = new DatabaseMigrator();
  migrator.migrateNodes('Books').then(() => {
    console.log('Migration process completed.');
  }).catch(error => {
    console.error('Migration process failed:', error);
    process.exit(1);
  });  