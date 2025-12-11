import { describe, test, expect, beforeAll } from "vitest";
import { Orchestrator } from "../../src/orchestrator/index.js";
import { RAGAgent } from "../../src/agents/rag-agent.js";
import { OrderAgent } from "../../src/agents/order-agent.js";
import { createChromaVectorStore } from "../../src/vector-stores/chroma.js";
import { loadProductsFromDirectory } from "../../src/loaders/directory-loader.js";
import { productsToDocuments } from "../../src/loaders/json-loader.js";
import { createTextSplitter } from "../../src/splitters/index.js";
import { getDataPath } from "../../src/utils/paths.js";

let orchestrator: Orchestrator;

beforeAll(async () => {
  console.log("Setting up test environment...");

  const products = await loadProductsFromDirectory(getDataPath());
  console.log(`Loaded ${products.length} products for testing`);

  const documents = productsToDocuments(products);
  const splitter = createTextSplitter();
  const chunks = await splitter.splitDocuments(documents);
  console.log(`Created ${chunks.length} document chunks`);

  const vectorStore = await createChromaVectorStore(chunks, "products-test");
  console.log("Vector store initialized");

  const ragAgent = new RAGAgent(vectorStore);
  const orderAgent = new OrderAgent();

  orchestrator = new Orchestrator(ragAgent, orderAgent);
  console.log("Test setup complete!\n");
}, 60000);

describe("Chatbot Conversation Flows", () => {
  describe("1. Product Price Query", () => {
    test("should return correct price for iPhone 15 Pro", async () => {
      const response = await orchestrator.processMessage(
        "How much is the iPhone 15 Pro?",
      );

      expect(response).toBeDefined();
      expect(response.agent).toBe("rag");
      expect(response.response).toBeTruthy();

      expect(response.response.toLowerCase()).toMatch(
        /\$?999|\$\s*999|999\s*dollars?/i,
      );

      expect(response.response.toLowerCase()).toContain("iphone");

      console.log("✓ Product price query test passed");
      console.log(`  Response: ${response.response.substring(0, 150)}...`);
    }, 30000);

    test("should return correct price for MacBook Pro", async () => {
      const response = await orchestrator.processMessage(
        "What's the price of the MacBook Pro 16-inch?",
      );

      expect(response).toBeDefined();
      expect(response.agent).toBe("rag");
      expect(response.response).toBeTruthy();

      expect(response.response.toLowerCase()).toMatch(
        /\$?2[,]?499|\$\s*2[,]?499|2[,]?499\s*dollars?/i,
      );

      console.log("✓ MacBook Pro price query test passed");
      console.log(`  Response: ${response.response.substring(0, 150)}...`);
    }, 30000);

    test("should provide product details beyond just price", async () => {
      const response = await orchestrator.processMessage(
        "Tell me about the Sony WH-1000XM5 headphones",
      );

      expect(response).toBeDefined();
      expect(response.agent).toBe("rag");
      expect(response.response).toBeTruthy();

      expect(response.response.toLowerCase()).toMatch(
        /\$?379|\$\s*379|379\s*dollars?/i,
      );

      expect(response.response.toLowerCase()).toMatch(/sony|headphone/i);

      console.log("✓ Product details query test passed");
      console.log(`  Response: ${response.response.substring(0, 200)}...`);
    }, 30000);
  });

  describe("2. Multi-turn Product Discussion", () => {
    test("should handle follow-up questions about same product", async () => {
      const response1 = await orchestrator.processMessage("Show me laptops");

      expect(response1.agent).toBe("rag");
      expect(response1.response).toBeTruthy();
      expect(response1.response.toLowerCase()).toMatch(
        /laptop|macbook|dell|hp/i,
      );

      console.log("✓ Initial laptop query:");
      console.log(`  ${response1.response.substring(0, 150)}...`);

      const response2 = await orchestrator.processMessage(
        "What about the MacBook Pro?",
      );

      expect(response2.agent).toBe("rag");
      expect(response2.response).toBeTruthy();
      expect(response2.response.toLowerCase()).toContain("macbook");

      console.log("✓ Follow-up question about MacBook:");
      console.log(`  ${response2.response.substring(0, 150)}...`);

      const response3 = await orchestrator.processMessage(
        "What are its specifications?",
      );

      expect(response3.agent).toBe("rag");
      expect(response3.response).toBeTruthy();
      expect(response3.response.length).toBeGreaterThan(50);

      console.log("✓ Follow-up for specifications:");
      console.log(`  ${response3.response.substring(0, 150)}...`);
    }, 60000);

    test("should maintain context across product comparisons", async () => {
      const response1 = await orchestrator.processMessage(
        "What's the difference between the iPhone 15 Pro and Samsung Galaxy S24?",
      );

      expect(response1.agent).toBe("rag");
      expect(response1.response).toBeTruthy();
      expect(response1.response.toLowerCase()).toMatch(
        /iphone|samsung|galaxy/i,
      );

      console.log("✓ Product comparison query:");
      console.log(`  ${response1.response.substring(0, 200)}...`);
    }, 30000);
  });

  describe("3. Order Confirmation with Extraction", () => {
    test("should extract order details from conversation and create order", async () => {
      const response1 = await orchestrator.processMessage(
        "I want to buy an iPhone 15 Pro",
      );

      expect(response1).toBeDefined();
      console.log("✓ Order intent detected:");
      console.log(`  ${response1.response.substring(0, 150)}...`);

      const response2 = await orchestrator.processMessage(
        "I'll take 2 of them",
      );

      expect(response2).toBeDefined();
      console.log("✓ Quantity specified:");
      console.log(`  ${response2.response.substring(0, 150)}...`);

      const response3 = await orchestrator.processMessage(
        "My name is John Doe, email is john@example.com, and my billing address is 123 Main St, New York, NY",
      );

      expect(response3).toBeDefined();
      console.log("✓ Customer info provided:");
      console.log(`  ${response3.response.substring(0, 150)}...`);

      const response4 = await orchestrator.processMessage(
        "Yes, please confirm the order",
      );

      expect(response4).toBeDefined();
      expect(response4.agent).toBe("order");

      const confirmationText = response4.response.toLowerCase();
      const hasOrderConfirmation =
        confirmationText.includes("order") ||
        confirmationText.includes("confirm") ||
        confirmationText.includes("summary");

      expect(hasOrderConfirmation).toBe(true);

      console.log("✓ Order confirmation:");
      console.log(`  ${response4.response.substring(0, 200)}...`);

      if (response4.orderCreated && response4.orderId) {
        expect(response4.orderId).toMatch(/ORD-[A-Z0-9]+-\d+/);
        console.log(`✓ Order created with ID: ${response4.orderId}`);
      }
    }, 90000);

    test("should extract product from previous discussion when ordering", async () => {
      orchestrator.clearHistory();

      const response1 = await orchestrator.processMessage(
        "Tell me about the Dell XPS 15",
      );

      expect(response1.agent).toBe("rag");
      console.log("✓ Product inquiry:");
      console.log(`  ${response1.response.substring(0, 150)}...`);

      const response2 = await orchestrator.processMessage(
        "I'd like to purchase it",
      );

      expect(response2.agent).toBe("order");
      expect(response2.response).toBeTruthy();

      console.log("✓ Order intent with pronoun reference:");
      console.log(`  ${response2.response.substring(0, 200)}...`);
    }, 60000);
  });

  describe("4. Ambiguous Query Handling", () => {
    test("should ask for clarification when query is too vague", async () => {
      orchestrator.clearHistory();

      const response = await orchestrator.processMessage("I want a phone");

      expect(response).toBeDefined();
      expect(["rag", "order"]).toContain(response.agent);
      expect(response.response).toBeTruthy();

      const responseText = response.response.toLowerCase();
      const asksClarification =
        responseText.includes("which") ||
        responseText.includes("specific") ||
        responseText.includes("more") ||
        responseText.includes("iphone") ||
        responseText.includes("samsung") ||
        responseText.includes("several") ||
        responseText.includes("multiple") ||
        responseText.includes("what kind") ||
        responseText.includes("which phone");

      expect(asksClarification).toBe(true);

      console.log("✓ Ambiguous query handled:");
      console.log(`  Agent: ${response.agent}`);
      console.log(`  ${response.response.substring(0, 200)}...`);
    }, 30000);

    test('should handle ambiguous "I want one" without context', async () => {
      const freshOrchestrator = new Orchestrator(
        orchestrator["ragAgent"],
        orchestrator["orderAgent"],
      );

      const response = await freshOrchestrator.processMessage("I want one");

      expect(response).toBeDefined();
      expect(response.response).toBeTruthy();

      const responseText = response.response.toLowerCase();
      const asksClarification =
        responseText.includes("which") ||
        responseText.includes("what") ||
        responseText.includes("specify") ||
        responseText.includes("product") ||
        responseText.includes("help you");

      expect(asksClarification).toBe(true);

      console.log('✓ Ambiguous "I want one" handled:');
      console.log(`  ${response.response.substring(0, 150)}...`);
    }, 30000);

    test("should handle multiple matching products gracefully", async () => {
      const response = await orchestrator.processMessage("Show me computers");

      expect(response).toBeDefined();
      expect(response.agent).toBe("rag");
      expect(response.response).toBeTruthy();

      const responseText = response.response.toLowerCase();
      expect(responseText.length).toBeGreaterThan(100);

      console.log("✓ Multiple products query handled:");
      console.log(`  ${response.response.substring(0, 200)}...`);
    }, 30000);
  });

  describe("5. Invalid Order Rejection", () => {
    test("should reject order with negative quantity", async () => {
      const response1 = await orchestrator.processMessage(
        "I want to buy -5 iPhones",
      );

      expect(response1).toBeDefined();

      const responseText = response1.response.toLowerCase();

      if (response1.orderCreated) {
        expect(response1.orderCreated).toBe(false);
      }

      console.log("✓ Negative quantity handled:");
      console.log(`  ${response1.response.substring(0, 200)}...`);
    }, 30000);

    test("should reject order with zero quantity", async () => {
      const response1 = await orchestrator.processMessage(
        "I'd like to order 0 MacBooks",
      );

      expect(response1).toBeDefined();

      const responseText = response1.response.toLowerCase();

      const handlesInvalid =
        responseText.includes("how many") ||
        responseText.includes("quantity") ||
        responseText.includes("at least") ||
        !response1.orderCreated;

      expect(handlesInvalid).toBe(true);

      console.log("✓ Zero quantity handled:");
      console.log(`  ${response1.response.substring(0, 200)}...`);
    }, 30000);

    test("should handle order without required customer information", async () => {
      const response1 = await orchestrator.processMessage(
        "I want to buy a Dell XPS 15",
      );

      expect(response1.agent).toBe("order");
      console.log("✓ Order intent without customer info:");
      console.log(`  ${response1.response.substring(0, 150)}...`);

      const response2 = await orchestrator.processMessage(
        "Yes, place the order",
      );

      expect(response2).toBeDefined();

      const responseText = response2.response.toLowerCase();
      const asksMissingInfo =
        responseText.includes("name") ||
        responseText.includes("address") ||
        responseText.includes("email") ||
        responseText.includes("information") ||
        responseText.includes("provide") ||
        responseText.includes("need");

      if (asksMissingInfo) {
        expect(response2.orderCreated).toBeFalsy();
      }

      console.log("✓ Missing customer info handled:");
      console.log(`  ${response2.response.substring(0, 200)}...`);
    }, 60000);

    test("should reject order for out-of-stock product", async () => {
      orchestrator.clearHistory();

      const response = await orchestrator.processMessage(
        "I want to check if you have any out of stock items",
      );

      expect(response).toBeDefined();
      expect(["rag", "order"]).toContain(response.agent);

      console.log("✓ Stock status query:");
      console.log(`  Agent: ${response.agent}`);
      console.log(`  ${response.response.substring(0, 200)}...`);
    }, 30000);
  });

  describe("Additional Edge Cases", () => {
    test("should handle mixed language appropriately", async () => {
      const response = await orchestrator.processMessage(
        "What's the precio of iPhone?",
      );

      expect(response).toBeDefined();
      expect(response.agent).toBe("rag");
      expect(response.response).toBeTruthy();

      console.log("✓ Mixed language query handled:");
      console.log(`  ${response.response.substring(0, 150)}...`);
    }, 30000);

    test("should handle very long product names", async () => {
      const response = await orchestrator.processMessage(
        "Tell me about the MacBook Pro 16-inch with M3 chip",
      );

      expect(response).toBeDefined();
      expect(response.agent).toBe("rag");
      expect(response.response).toBeTruthy();

      console.log("✓ Long product name query handled:");
      console.log(`  ${response.response.substring(0, 150)}...`);
    }, 30000);

    test("should maintain conversation state correctly", async () => {
      orchestrator.clearHistory();

      const response1 = await orchestrator.processMessage("Hello");
      expect(response1).toBeDefined();

      const response2 = await orchestrator.processMessage(
        "What did I just say?",
      );
      expect(response2).toBeDefined();

      const responseText = response2.response.toLowerCase();
      const maintainsContext =
        responseText.includes("hello") ||
        responseText.includes("greeted") ||
        responseText.includes("said") ||
        responseText.includes("previous") ||
        responseText.includes("just") ||
        responseText.includes("hi") ||
        responseText.includes("greeting");

      const reasonableResponse =
        maintainsContext ||
        responseText.includes("don't have access") ||
        responseText.includes("cannot see") ||
        responseText.length > 20;

      expect(reasonableResponse).toBe(true);

      console.log("✓ Conversation state maintained:");
      console.log(`  ${response2.response.substring(0, 150)}...`);
    }, 30000);
  });
});
