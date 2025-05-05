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

const app = new App();
app.processProducts().then(() => console.log('Processing complete.'));



