import neo4j, { Driver, Session } from 'neo4j-driver';

const EXPORT_FILENAME = 'user_nodes.json';

const stagingConfig = {
    uri: 'neo4j://34.142.174.13:7687', // Replace with your staging Neo4j Bolt URL
    user: 'neo4j',                    // Replace with your staging username
    password: 'foobar123%'      // Replace with your staging password
  };
  
  const productionConfig = {
    uri: 'bolt://35.185.185.221:7687', // Replace with your production Neo4j Bolt URL
    user: 'neo4j',                      // Replace with your production username
    password: 'b2Y7OACNdN8E_wTpSc9Xac-CUqAFnwNWZBaN7SyUNsA'     // Replace with your production password
  };

async function exportNodesFromStaging() {
  const driver = neo4j.driver(stagingConfig.uri, neo4j.auth.basic(stagingConfig.user,stagingConfig.password));
  const session = driver.session();

  try {
    const result = await session.run(`
      CALL apoc.export.json.query(
        "MATCH (u:User) RETURN u",
        "${EXPORT_FILENAME}",
        {useTypes: true}
      )
    `);
    console.log('✅ Exported User nodes:', result.records[0].toObject());
  } catch (err) {
    console.error('❌ Error exporting User nodes:', err);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function importNodesToProduction() {
  const driver = neo4j.driver(productionConfig.uri, neo4j.auth.basic(productionConfig.user, productionConfig.password));
  const session = driver.session();

  try {
    const result = await session.run(`
      CALL apoc.import.json(
        "${EXPORT_FILENAME}",
        {batchSize: 1000, readLabels: true}
      )
    `);
    console.log('✅ Imported User nodes:', result.records[0].toObject());
  } catch (err) {
    console.error('❌ Error importing User nodes:', err);
  } finally {
    await session.close();
    await driver.close();
  }
}

(async () => {
  console.log('--- Exporting from Staging (only nodes) ---');
  await exportNodesFromStaging();

  console.log(`⚠️ Manually move the file '${EXPORT_FILENAME}' from staging to production Neo4j /import directory.`);

  console.log('--- Importing to Production (only nodes) ---');
  await importNodesToProduction();
})();
