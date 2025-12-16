import { ChatOpenAI } from "@langchain/openai";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";
import { getConfig } from "../config/env.js";
import { logger } from "../logger.js";
import { createDatabase, createOrder } from "../database/index.js";
import { validateOrder, Order } from "../models/order.js";
import { Product } from "../models/product.js";
import { loadProductsFromDirectory } from "../loaders/directory-loader.js";
import { ProductContextManager } from "../utils/product-context.js";
import { ProductListItem } from "../orchestrator/index.js";
import {
  GuardrailsCallbackHandler,
  DEFAULT_CONFIG,
} from "../security/index.js";
import { getDataPath } from "../utils/paths.js";
import {
  LANGUAGE_NAMES,
  type LanguageCode,
} from "@shared/constants/languages.js";

const db = createDatabase();

const searchProductsTool = new DynamicStructuredTool({
  name: "search_products",
  description:
    "Search for products by name, category, or description. Use this when the user asks about product information, prices, availability, or specifications.",
  schema: z.object({
    query: z
      .string()
      .describe("Search query - can be product name, category, or description"),
  }),
  func: async (input: { query: string }) => {
    const { query } = input;
    logger.debug({ query }, "Searching products");
    const products = await loadProductsFromDirectory(getDataPath());

    const lowerQuery = query.toLowerCase();
    const matchingProducts = products.filter(
      (p: Product) =>
        p.name.toLowerCase().includes(lowerQuery) ||
        p.description.toLowerCase().includes(lowerQuery) ||
        p.category.toLowerCase().includes(lowerQuery),
    );

    if (matchingProducts.length === 0) {
      return JSON.stringify({
        found: false,
        message: `No products found matching "${query}"`,
      });
    }

    return JSON.stringify({
      found: true,
      products: matchingProducts.slice(0, 5), // Limit to 5 results
    });
  },
});

const prepareOrderConfirmationTool = new DynamicStructuredTool({
  name: "prepare_order_confirmation",
  description:
    "Prepare an order confirmation summary with all order details. Use this when the user has provided all required invoice information (customer name, billing address, and invoice email) but BEFORE creating the order. This shows the user a complete summary of their order for confirmation. Extract all order details from the conversation history including product names, quantities, prices, customer information, and invoice information.",
  schema: z.object({
    items: z
      .array(
        z.object({
          product_id: z.string().describe("Product ID"),
          product_name: z.string().describe("Product name"),
          quantity: z.number().int().gt(0).describe("Quantity"),
          price: z.number().gt(0).describe("Price per unit"),
        }),
      )
      .min(1)
      .describe("Order items"),
    customer_name: z.string().min(1).describe("Customer name (REQUIRED)"),
    customer_email: z
      .string()
      .email()
      .optional()
      .describe("Customer email if mentioned"),
    customer_phone: z
      .string()
      .optional()
      .describe("Customer phone if mentioned"),
    shipping_address: z
      .string()
      .optional()
      .describe("Shipping address if mentioned"),
    billing_address: z
      .string()
      .min(1)
      .describe("Billing address for invoice (REQUIRED)"),
    invoice_email: z
      .string()
      .email()
      .describe("Email address where invoice will be sent (REQUIRED)"),
  }),
  func: async (input: {
    items: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      price: number;
    }>;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    shipping_address?: string;
    billing_address: string;
    invoice_email: string;
  }) => {
    const {
      items,
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      billing_address,
      invoice_email,
    } = input;
    logger.debug({ items: items.length }, "Preparing order confirmation");

    if (!customer_name || customer_name.trim() === "") {
      return JSON.stringify({
        success: false,
        error: "Customer name is required",
      });
    }

    const totalPrice = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const orderSummary = {
      success: true,
      items: items.map((item) => ({
        product_name: item.product_name,
        quantity: item.quantity,
        price: item.price,
        subtotal: item.price * item.quantity,
      })),
      total_price: totalPrice,
      customer_name: customer_name.trim(),
      customer_email: customer_email?.trim(),
      customer_phone: customer_phone?.trim(),
      shipping_address: shipping_address?.trim(),
      billing_address: billing_address.trim(),
      invoice_email: invoice_email.trim(),
      confirmation_message:
        `Please confirm your order:\n\n` +
        `**Order Details:**\n` +
        items
          .map(
            (item) =>
              `- ${item.product_name} x${item.quantity} @ $${item.price.toFixed(2)} each = $${(item.price * item.quantity).toFixed(2)}`,
          )
          .join("\n") +
        `\n\n**Total: $${totalPrice.toFixed(2)}**\n\n` +
        `**Customer Information:**\n` +
        `- Name: ${customer_name.trim()}\n` +
        (customer_email ? `- Email: ${customer_email.trim()}\n` : "") +
        (customer_phone ? `- Phone: ${customer_phone.trim()}\n` : "") +
        (shipping_address
          ? `- Shipping Address: ${shipping_address.trim()}\n`
          : "") +
        `- Billing Address: ${billing_address.trim()}\n` +
        `- Invoice Email: ${invoice_email.trim()}\n\n` +
        `Please confirm if you'd like to proceed with this order.`,
    };

    return JSON.stringify(orderSummary);
  },
});

const createOrderTool = new DynamicStructuredTool({
  name: "create_order",
  description:
    "Create a new order in the database. Use this ONLY after the user has explicitly confirmed the order (said 'yes', 'confirm', 'proceed', 'place order', etc.) after seeing the order confirmation summary. This tool actually creates the order in the database. Extract all order details from the conversation history including product names, quantities, prices, customer information, and invoice information.",
  schema: z.object({
    items: z
      .array(
        z.object({
          product_id: z.string().describe("Product ID"),
          product_name: z.string().describe("Product name"),
          quantity: z.number().int().gt(0).describe("Quantity"),
          price: z.number().gt(0).describe("Price per unit"),
        }),
      )
      .min(1)
      .describe("Order items"),
    customer_name: z.string().min(1).describe("Customer name (REQUIRED)"),
    customer_email: z
      .string()
      .email()
      .optional()
      .describe("Customer email if mentioned"),
    customer_phone: z
      .string()
      .optional()
      .describe("Customer phone if mentioned"),
    shipping_address: z
      .string()
      .optional()
      .describe("Shipping address if mentioned"),
    billing_address: z
      .string()
      .min(1)
      .describe("Billing address for invoice (REQUIRED)"),
    invoice_email: z
      .string()
      .email()
      .describe("Email address where invoice will be sent (REQUIRED)"),
  }),
  func: async (input: {
    items: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      price: number;
    }>;
    customer_name: string;
    customer_email?: string;
    customer_phone?: string;
    shipping_address?: string;
    billing_address: string;
    invoice_email: string;
  }) => {
    const {
      items,
      customer_name,
      customer_email,
      customer_phone,
      shipping_address,
      billing_address,
      invoice_email,
    } = input;
    logger.debug({ items: items.length }, "Creating order");

    if (!customer_name || customer_name.trim() === "") {
      return JSON.stringify({
        success: false,
        error: "Customer name is required",
      });
    }

    const normalizeOptional = (value?: string): string | undefined => {
      return value && value.trim() !== "" ? value.trim() : undefined;
    };

    const totalPrice = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    const orderData: Omit<Order, "order_id" | "created_at"> = {
      items: items,
      total_price: totalPrice,
      customer_name: customer_name.trim(),
      customer_email: normalizeOptional(customer_email),
      customer_phone: normalizeOptional(customer_phone),
      shipping_address: normalizeOptional(shipping_address),
      billing_address: billing_address.trim(),
      invoice_email: invoice_email.trim(),
      status: "pending",
    };

    try {
      logger.debug({ orderData }, "Validating order data");

      const validatedOrder = validateOrder({
        ...orderData,
        order_id: "temp",
        created_at: new Date().toISOString(),
      });

      logger.debug({ validatedOrder }, "Order validated, creating in database");
      const order = createOrder(db, orderData);

      return JSON.stringify({
        success: true,
        order_id: order.order_id,
        total_price: order.total_price,
        items: order.items,
        message: `Order created successfully! Order ID: ${order.order_id}`,
      });
    } catch (error) {
      logger.error({ error, orderData }, "Failed to create order");
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return JSON.stringify({
        success: false,
        error: errorMessage,
      });
    }
  },
});

export class OrderAgent {
  private llm: ChatOpenAI;
  private tools: DynamicStructuredTool[];
  public readonly name: string = "order-processing";

  constructor() {
    const config = getConfig();
    this.llm = new ChatOpenAI({
      openAIApiKey: config.openaiApiKey,
      modelName: config.llmModel,
      temperature: 0.3, // Lower temperature for more consistent order processing
      callbacks: [new GuardrailsCallbackHandler(DEFAULT_CONFIG)],
    });
    this.tools = [
      searchProductsTool,
      prepareOrderConfirmationTool,
      createOrderTool,
    ];

    logger.debug(
      { agent: this.name },
      "Order Agent initialized with guardrails",
    );
  }

  async invoke(
    question: string,
    chatHistory: Array<{ role: string; content: string }> = [],
    language?: string,
  ): Promise<{
    response: string;
    toolCalls?: Array<{ name: string; args: unknown }>;
    orderCreated?: boolean;
    orderId?: string;
    productList?: ProductListItem[];
  }> {
    logger.debug(
      { agent: this.name, question: question.substring(0, 100) },
      "Processing order request",
    );

    const sanitizedQuestion = question;

    const historyContext = chatHistory
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join("\n");

    // If language is set via UI, use it. Otherwise, detect from user's message.
    const languageRule =
      language && language in LANGUAGE_NAMES
        ? `CRITICAL LANGUAGE RULE - HIGHEST PRIORITY (READ THIS FIRST):
The user's language is set to ${LANGUAGE_NAMES[language as LanguageCode]}. You MUST respond ONLY in ${LANGUAGE_NAMES[language as LanguageCode]}.
- Always respond in ${LANGUAGE_NAMES[language as LanguageCode]}, regardless of the language used in the user's message
- Maintain consistency: use ${LANGUAGE_NAMES[language as LanguageCode]} throughout the conversation`
        : `CRITICAL LANGUAGE RULE - HIGHEST PRIORITY (READ THIS FIRST):
You MUST respond in the EXACT same language that the user uses in their CURRENT question.
- Analyze the user's CURRENT question to detect its language
- Respond ONLY in that detected language
- If the user writes in English, respond ONLY in English
- If the user writes in Spanish, respond ONLY in Spanish
- If the user writes in French, respond ONLY in French
- The user's CURRENT question language takes ABSOLUTE priority - ignore conversation history language if it differs
- DO NOT continue in a previous language if the user switches languages`;

    const messages: Array<[string, string]> = [
      [
        "system",
        `${languageRule}

You are an order processing assistant. Your job is to:
1. Search for products when users ask about them
2. Collect invoice information before creating orders
3. Create orders when users confirm they want to purchase AND have provided all required invoice information

REQUIRED INFORMATION (must be collected before order creation):
- Customer name (REQUIRED): The name of the customer placing the order
- Billing address (REQUIRED): The address where the invoice should be sent
- Invoice email (REQUIRED): Email address where the invoice will be sent

OPTIONAL INFORMATION:
- Customer email: Email address for order updates
- Customer phone: Phone number for order updates
- Shipping address: Address for product delivery

When creating orders, extract ALL information from the conversation history:
- Product names and IDs (use search_products if needed to get product IDs)
- Quantities (if user says "I'll take 2", extract quantity=2)
- Prices (from product search results)
- Customer information: name (REQUIRED), email, phone, shipping address
- Invoice information: billing address (REQUIRED), invoice email (REQUIRED)

IMPORTANT ORDER FLOW - FOLLOW THESE STEPS CAREFULLY:

STEP 1: Collect all required information:
1. Product details (items, quantities, prices)
2. Customer name (REQUIRED)
3. Billing address (REQUIRED)
4. Invoice email (REQUIRED)

STEP 2: When ALL required information is collected, use prepare_order_confirmation tool to show the user a complete order summary with:
- Product names, quantities, and prices
- Total price
- Customer information
- Billing address
- Invoice email
- All other order details

STEP 3: After showing the confirmation summary, ask the user to confirm: "Please confirm if you'd like to proceed with this order" or similar.

STEP 4: ONLY after the user explicitly confirms (says "yes", "confirm", "proceed", "place order", "I confirm", etc.), use create_order tool to actually create the order in the database.

CRITICAL RULES:
- NEVER call create_order immediately after collecting invoice information
- ALWAYS show order confirmation summary first using prepare_order_confirmation
- ONLY call create_order after explicit user confirmation
- If the user confirms an order but is missing required information, politely ask for the missing information. Do NOT prepare confirmation or create the order until all required fields are provided.

Be thorough and extract all details from the conversation. Don't ask the user to repeat information they've already provided.

When searching for products:
- Do NOT immediately list all specifications and details
- Briefly mention product name(s) and price(s)
- Ask if the customer would like more information about specifications, features, or other details
- Only provide detailed specifications when the customer explicitly asks for them

If the user hasn't confirmed an order yet, just search for products and provide information.`,
      ],
    ];

    if (historyContext) {
      messages.push(["human", `Previous conversation:\n${historyContext}`]);
    }

    messages.push(["human", "{question}"]);

    const prompt = ChatPromptTemplate.fromMessages(messages);

    logger.debug(
      {
        toolCount: this.tools.length,
        toolNames: this.tools.map((t) => t.name),
      },
      "Binding tools to LLM",
    );

    const llmWithTools = this.llm.bindTools(this.tools);
    const chain = prompt.pipe(llmWithTools);

    const response = await chain.invoke({ question: sanitizedQuestion });

    const toolCalls = response.tool_calls || [];
    let finalResponse = "";
    let orderCreated = false;
    let orderId: string | undefined;
    let trackedProductList: ProductListItem[] | undefined;

    if (toolCalls.length > 0) {
      logger.debug(
        { toolCalls: toolCalls.length },
        "Tool calls detected, executing",
      );

      for (const toolCall of toolCalls) {
        const tool = this.tools.find((t) => t.name === toolCall.name);
        if (tool) {
          try {
            const result = await tool.invoke(
              toolCall.args as Record<string, unknown>,
            );
            const parsedResult = JSON.parse(result as string);

            if (
              toolCall.name === "prepare_order_confirmation" &&
              parsedResult.success
            ) {
              finalResponse =
                parsedResult.confirmation_message ||
                `Please confirm your order:\n\n` +
                  `**Order Details:**\n` +
                  parsedResult.items
                    .map(
                      (item: {
                        product_name: string;
                        quantity: number;
                        price: number;
                        subtotal: number;
                      }) =>
                        `- ${item.product_name} x${item.quantity} @ $${item.price.toFixed(2)} each = $${item.subtotal.toFixed(2)}`,
                    )
                    .join("\n") +
                  `\n\n**Total: $${parsedResult.total_price.toFixed(2)}**\n\n` +
                  `**Customer Information:**\n` +
                  `- Name: ${parsedResult.customer_name}\n` +
                  (parsedResult.customer_email
                    ? `- Email: ${parsedResult.customer_email}\n`
                    : "") +
                  (parsedResult.customer_phone
                    ? `- Phone: ${parsedResult.customer_phone}\n`
                    : "") +
                  (parsedResult.shipping_address
                    ? `- Shipping Address: ${parsedResult.shipping_address}\n`
                    : "") +
                  `- Billing Address: ${parsedResult.billing_address}\n` +
                  `- Invoice Email: ${parsedResult.invoice_email}\n\n` +
                  `Please confirm if you'd like to proceed with this order.`;
            } else if (
              toolCall.name === "create_order" &&
              parsedResult.success
            ) {
              orderCreated = true;
              orderId = parsedResult.order_id;
              finalResponse = `Perfect! Your order has been confirmed.\n\nOrder ID: ${parsedResult.order_id}\nTotal: $${parsedResult.total_price.toFixed(2)}\n\nItems:\n${parsedResult.items.map((item: { product_name: string; quantity: number; price: number }) => `- ${item.product_name} x${item.quantity} @ $${item.price.toFixed(2)}`).join("\n")}\n\nThank you for your purchase!`;
            } else if (toolCall.name === "search_products") {
              if (parsedResult.found) {
                const products = parsedResult.products as Product[];

                // Track structured product list
                trackedProductList =
                  ProductContextManager.extractFromProducts(products);

                if (products.length === 1) {
                  finalResponse = `I found **${products[0].name}** for $${products[0].price.toFixed(2)}. Would you like more information about this product, such as specifications, features, or availability?`;
                } else {
                  const productList = products
                    .map(
                      (p: Product) =>
                        `- **${p.name}** - $${p.price.toFixed(2)}`,
                    )
                    .join("\n");
                  finalResponse = `I found ${products.length} product(s) that might interest you:\n\n${productList}\n\nWould you like more information about any of these products?`;
                }
              } else {
                finalResponse = parsedResult.message;
              }
            } else {
              finalResponse = result as string;
            }
          } catch (error) {
            logger.error(
              { error, toolCall, input: toolCall.args },
              "Error executing tool",
            );
            const errorMessage =
              error instanceof Error ? error.message : String(error);
            finalResponse = `I encountered an error processing your request: ${errorMessage}. Please try again.`;
          }
        }
      }

      const isOrderConfirmation = toolCalls.some(
        (tc) => tc.name === "prepare_order_confirmation",
      );
      const isOrderCreated = toolCalls.some((tc) => tc.name === "create_order");

      if (!isOrderConfirmation && !isOrderCreated) {
        const formattedResponse = await this.llm.invoke(
          `Based on the tool execution results, provide a natural response to the user:\n\nTool Results:\n${finalResponse}\n\nUser's original question: ${question}\n\nProvide a friendly, conversational response. If the tool results mention products, maintain the approach of asking if the customer needs more information rather than listing all specifications immediately.`,
        );
        finalResponse = (formattedResponse.content as string) || finalResponse;
      }
    } else {
      finalResponse =
        (response.content as string) ||
        "I'm here to help with product information and orders. How can I assist you?";
    }

    return {
      response: finalResponse,
      toolCalls: toolCalls.map((tc) => ({
        name: tc.name,
        args: tc.args,
      })),
      orderCreated,
      orderId,
      productList: trackedProductList,
    };
  }

  async stream(
    question: string,
    chatHistory: Array<{ role: string; content: string }> = [],
    language?: string,
    onToken?: (token: string) => void,
  ): Promise<{
    response: string;
    toolCalls?: Array<{ name: string; args: unknown }>;
    orderCreated?: boolean;
    orderId?: string;
    productList?: ProductListItem[];
  }> {
    logger.debug(
      { agent: this.name, question: question.substring(0, 100) },
      "Streaming order request",
    );

    const result = await this.invoke(question, chatHistory, language);
    const words = result.response.split(/(\s+)/);
    for (const word of words) {
      onToken?.(word);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return result;
  }
}
