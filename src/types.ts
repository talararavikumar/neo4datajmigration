// src/types.ts
export interface ShopifyProduct {
    id: string;
    handle: string;
    availableForSale: boolean;
    title: string;
    description: string;
    descriptionHtml: string;
    featuredImage: {
      url: string;
      altText: string | null;
      width: number;
      height: number;
    };
    variants:[{
      id:string
    }]
    // Add other fields as needed
  }
  
  export interface ProductNode {
    ebookUrl: string;
    productId: string;
    price: string;
    name: string;
    handle: string;
    variantId: string;
    sku: string;
  }
  
  export interface BooksNode {
    ebook_saleprice: number;
    coverImageUrl: string;
    isPublished: boolean;
    paperback_originalprice: number;
    description: string;
    numberofreviews: number;
    ebook_pdfUrl: string;
    title: string;
    isSDCurated: boolean;
    paperback_saleprice: number;
    paperback_pdfUrl: string;
    currency: string;
    userEmail: string;
    avgRating: number;
  }