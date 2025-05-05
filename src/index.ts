// src/index.ts
import neo4j, { Driver, Session } from 'neo4j-driver';
import fs from 'fs/promises';
import path from 'path';
import dotenv from 'dotenv';
import { ShopifyProduct, ProductNode, BooksNode } from './types';

dotenv.config();

class App {
  private driver: Driver;

  constructor() {
    this.driver = neo4j.driver(
      process.env.NEO4J_URI || 'bolt://localhost:7687',
      neo4j.auth.basic(
        process.env.NEO4J_USER || 'neo4j',
        process.env.NEO4J_PASSWORD || ''
      )
    );
  }

  // Extract productId from Shopify id (e.g., "gid://shopify/Product/9650624037175" -> "9650624037175")
  private extractProductId(id: string): string {
    const parts = id.split('/');
    return parts[parts.length - 1];
  }

  // Read Shopify products from JSON file
  private async readShopifyProducts(filePath: string): Promise<ShopifyProduct[]> {
    try {
      const data = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(data) as ShopifyProduct[];
    } catch (error) {
      console.error('Error reading JSON file:', error);
      return [];
    }
  }

  // Query Neo4j for Product node by variantId
  private async getProductByVariantId(
    session: Session,
    variantId: string
  ): Promise<ProductNode | null> {
    try {
      const result = await session.run(
        'MATCH (p:Product {variantId: $variantId}) RETURN p',
        { variantId }
      );
      if (result.records.length > 0) {
        return result.records[0].get('p').properties as ProductNode;
      }
      return null;
    } catch (error) {
      console.error(`Error querying Product with variantId ${variantId}:`, error);
      return null;
    }
  }

  // Create Books node in Neo4j
  private async createBooksNode(
    session: Session,
    shopifyProduct: ShopifyProduct,
    productNode: ProductNode
  ): Promise<void> {
    const booksNode: BooksNode = {
      ebook_saleprice: parseFloat(productNode.price),
      coverImageUrl: shopifyProduct.featuredImage.url,
      isPublished: true,
      paperback_originalprice: parseFloat(productNode.price),
      description: shopifyProduct.description,
      numberofreviews: 0,
      ebook_pdfUrl: productNode.ebookUrl,
      title: shopifyProduct.title,
      isSDCurated: true,
      paperback_saleprice: parseFloat(productNode.price),
      paperback_pdfUrl: productNode.ebookUrl,
      currency: 'INR',
      userEmail: 'default@example.com', // Replace with actual logic if available
      avgRating: 0,
    };

    try {
      await session.run(
        `CREATE (b:Books {
          ebook_saleprice: $ebook_saleprice,
          coverImageUrl: $coverImageUrl,
          isPublished: $isPublished,
          paperback_originalprice: $paperback_originalprice,
          description: $description,
          numberofreviews: $numberofreviews,
          ebook_pdfUrl: $ebook_pdfUrl,
          title: $title,
          isSDCurated: $isSDCurated,
          paperback_saleprice: $paperback_saleprice,
          paperback_pdfUrl: $paperback_pdfUrl,
          currency: $currency,
          userEmail: $userEmail,
          avgRating: $avgRating
        })`,
        booksNode
      );
      console.log(`Created Books node for title: ${booksNode.title}`);
    } catch (error) {
      console.error(`Error creating Books node for ${booksNode.title}:`, error);
    }
  }

  // Main process
  public async processProducts() {
    const session = this.driver.session();
    try {
      const filePath = path.join(__dirname, 'products.json');
      const shopifyProducts = await this.readShopifyProducts(filePath);

      for (const shopifyProduct of shopifyProducts) {
        const productId = this.extractProductId(shopifyProduct.variants[0].id);
        const productNode = await this.getProductByVariantId(session, productId);
        console.log(productId);

        if (productNode) {
          await this.createBooksNode(session, shopifyProduct, productNode);
        } else {
          console.log(`No Product node found for variantId: ${productId}`);
        }
      }
    } catch (error) {
      console.error('Error processing products:', error);
    } finally {
      await session.close();
      await this.driver.close();
    }
  }
}

const stagingConfig = {
  uri: 'http://34.142.174.13:7474', // Replace with your staging Neo4j Bolt URL
  user: 'neo4j',                    // Replace with your staging username
  password: 'foobar123%'      // Replace with your staging password
};

const productionConfig = {
  uri: 'http://35.185.185.221:7474', // Replace with your production Neo4j Bolt URL
  user: 'neo4j',                      // Replace with your production username
  password: 'b2Y7OACNdN8E_wTpSc9Xac-CUqAFnwNWZBaN7SyUNsA'     // Replace with your production password
};

class DatabaseMigrator {
  private stagingDriver: Driver;
  private productionDriver: Driver;

  constructor() {
    // Initialize staging driver
    this.stagingDriver = neo4j.driver(
      stagingConfig.uri,
      neo4j.auth.basic(stagingConfig.user, stagingConfig.password)
    );

    // Initialize production driver
    this.productionDriver = neo4j.driver(
      productionConfig.uri,
      neo4j.auth.basic(productionConfig.user, productionConfig.password)
    );
  }

  // Fetch Books nodes from staging
  private async fetchBooksFromStaging(session: Session): Promise<any[]> {
    try {
      const result = await session.run('MATCH (b:Books) RETURN b');
      return result.records.map(record => record.get('b').properties);
    } catch (error) {
      console.error('Error fetching Books nodes from staging:', error);
      return [];
    }
  }

  // Load Books nodes into production
  private async loadBooksIntoProduction(session: Session, books: any[]): Promise<number> {
    let successCount = 0;
    for (const book of books) {
      try {
        await session.run(
          `CREATE (b:Books)
           SET b = book
           RETURN b`,
          book
        );
        successCount++;
        console.log(`Migrated Books node: ${book.title}`);
      } catch (error) {
        console.error(`Error migrating Books node ${book.title}:`, error);
      }
    }
    return successCount;
  }

  // Main migration process
  public async migrateBooks() {
    const stagingSession = this.stagingDriver.session();
    const productionSession = this.productionDriver.session();

    try {
      console.log('Fetching Books nodes from staging...');
      const books = await this.fetchBooksFromStaging(stagingSession);
      console.log(`Fetched ${books.length} Books nodes from staging.`);

      if (books.length === 0) {
        console.log('No Books nodes to migrate.');
        return;
      }

      console.log('Loading Books nodes into production...');
      const successCount = await this.loadBooksIntoProduction(productionSession, books);
      console.log(`Successfully migrated ${successCount} of ${books.length} Books nodes to production.`);
    } catch (error) {
      console.error('Migration failed:', error);
    } finally {
      await stagingSession.close();
      await productionSession.close();
      await this.stagingDriver.close();
      await this.productionDriver.close();
    }
  }
}



const app = new App();
app.processProducts().then(() => console.log('Processing complete.'));