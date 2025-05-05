"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/index.ts
const neo4j_driver_1 = __importDefault(require("neo4j-driver"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class App {
    constructor() {
        this.driver = neo4j_driver_1.default.driver(process.env.NEO4J_URI || 'bolt://localhost:7687', neo4j_driver_1.default.auth.basic(process.env.NEO4J_USER || 'neo4j', process.env.NEO4J_PASSWORD || ''));
    }
    // Extract productId from Shopify id (e.g., "gid://shopify/Product/9650624037175" -> "9650624037175")
    extractProductId(id) {
        const parts = id.split('/');
        return parts[parts.length - 1];
    }
    // Read Shopify products from JSON file
    async readShopifyProducts(filePath) {
        try {
            const data = await promises_1.default.readFile(filePath, 'utf-8');
            return JSON.parse(data);
        }
        catch (error) {
            console.error('Error reading JSON file:', error);
            return [];
        }
    }
    // Query Neo4j for Product node by variantId
    async getProductByVariantId(session, variantId) {
        try {
            const result = await session.run('MATCH (p:Product {variantId: $variantId}) RETURN p', { variantId });
            if (result.records.length > 0) {
                return result.records[0].get('p').properties;
            }
            return null;
        }
        catch (error) {
            console.error(`Error querying Product with variantId ${variantId}:`, error);
            return null;
        }
    }
    // Create Books node in Neo4j
    async createBooksNode(session, shopifyProduct, productNode) {
        const booksNode = {
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
            await session.run(`CREATE (b:Books {
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
        })`, booksNode);
            console.log(`Created Books node for title: ${booksNode.title}`);
        }
        catch (error) {
            console.error(`Error creating Books node for ${booksNode.title}:`, error);
        }
    }
    // Main process
    async processProducts() {
        const session = this.driver.session();
        try {
            const filePath = path_1.default.join(__dirname, 'products.json');
            const shopifyProducts = await this.readShopifyProducts(filePath);
            for (const shopifyProduct of shopifyProducts) {
                const productId = this.extractProductId(shopifyProduct.variants[0].id);
                const productNode = await this.getProductByVariantId(session, productId);
                console.log(productId);
                if (productNode) {
                    await this.createBooksNode(session, shopifyProduct, productNode);
                }
                else {
                    console.log(`No Product node found for variantId: ${productId}`);
                }
            }
        }
        catch (error) {
            console.error('Error processing products:', error);
        }
        finally {
            await session.close();
            await this.driver.close();
        }
    }
}
const app = new App();
app.processProducts().then(() => console.log('Processing complete.'));
