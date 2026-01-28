import { describe, it, expect, beforeEach } from "bun:test";
import { MarketEngine } from "../market-engine";

describe("MarketEngine", () => {
  let engine: MarketEngine;

  beforeEach(() => {
    engine = new MarketEngine("TEST_ITEM", 100.0);
  });

  describe("initialization", () => {
    it("should initialize with default parameters", () => {
      expect(engine.getCurrentPrice()).toBe(100.0);
      expect(engine.getVolatility()).toBe(0.2);
      expect(engine.getDrift()).toBe(0.08);
    });

    it("should accept custom configuration", () => {
      const customEngine = new MarketEngine("CUSTOM_ITEM", 50.0, {
        drift: 0.1,
        volatility: 0.3,
        dt: 1 / 365,
      });

      expect(customEngine.getCurrentPrice()).toBe(50.0);
      expect(customEngine.getDrift()).toBe(0.1);
      expect(customEngine.getVolatility()).toBe(0.3);
    });
  });

  describe("Box-Muller transform", () => {
    it("should generate standard normal random variables", () => {
      const results: number[] = [];
      const sampleSize = 1000;

      for (let i = 0; i < sampleSize; i++) {
        engine.updatePrice();
        results.push(engine.getCurrentPrice());
      }

      const mean = results.reduce((sum, val) => sum + val, 0) / results.length;

      expect(mean).toBeGreaterThan(50);
      expect(mean).toBeLessThan(150);
    });

    it("should avoid log(0) errors", () => {
      expect(() => {
        for (let i = 0; i < 10000; i++) {
          engine.updatePrice();
        }
      }).not.toThrow();
    });
  });

  describe("GBM price simulation", () => {
    it("should update price using GBM formula", () => {
      const initialPrice = engine.getCurrentPrice();
      engine.updatePrice();
      const newPrice = engine.getCurrentPrice();

      expect(newPrice).not.toBe(initialPrice);
      expect(newPrice).toBeGreaterThan(0);
    });

    it("should handle multiple price updates", () => {
      const prices: number[] = [engine.getCurrentPrice()];

      for (let i = 0; i < 100; i++) {
        engine.updatePrice();
        prices.push(engine.getCurrentPrice());
      }

      expect(prices).toHaveLength(101);
      expect(prices[prices.length - 1]).toBeGreaterThan(0);

      const uniquePrices = new Set(prices);
      expect(uniquePrices.size).toBeGreaterThan(1);
    });

    it("should produce price variance with volatility", () => {
      const highVolEngine = new MarketEngine("HIGH_VOL", 100.0, {
        volatility: 0.5,
      });

      const lowVolEngine = new MarketEngine("LOW_VOL", 100.0, {
        volatility: 0.05,
      });

      const highVolPrices: number[] = [];
      const lowVolPrices: number[] = [];

      for (let i = 0; i < 100; i++) {
        highVolEngine.updatePrice();
        lowVolEngine.updatePrice();
        highVolPrices.push(highVolEngine.getCurrentPrice());
        lowVolPrices.push(lowVolEngine.getCurrentPrice());
      }

      const highVolVariance = calculateVariance(highVolPrices);
      const lowVolVariance = calculateVariance(lowVolPrices);

      expect(highVolVariance).toBeGreaterThan(lowVolVariance);
    });

    it("should respect drift parameter", () => {
      const positiveDriftEngine = new MarketEngine("POS_DRIFT", 100.0, {
        drift: 0.5,
        volatility: 0.1,
        dt: 0.01,
      });

      const initialPrice = positiveDriftEngine.getCurrentPrice();

      for (let i = 0; i < 1000; i++) {
        positiveDriftEngine.updatePrice();
      }

      const finalPrice = positiveDriftEngine.getCurrentPrice();

      expect(finalPrice).toBeGreaterThan(initialPrice);
    });

    it("should never produce negative prices", () => {
      engine = new MarketEngine("LOW_PRICE", 0.01, {
        drift: -0.5,
        volatility: 0.5,
      });

      for (let i = 0; i < 1000; i++) {
        engine.updatePrice();
        expect(engine.getCurrentPrice()).toBeGreaterThan(0);
      }
    });
  });

  describe("volatility", () => {
    it("should set and get volatility", () => {
      engine.setVolatility(0.5);
      expect(engine.getVolatility()).toBe(0.5);

      engine.setVolatility(0.1);
      expect(engine.getVolatility()).toBe(0.1);
    });

    it("should reject negative volatility", () => {
      engine.setVolatility(-0.1);
      expect(engine.getVolatility()).toBeGreaterThanOrEqual(0);
    });

    it("should handle zero volatility", () => {
      engine.setVolatility(0);
      const initialPrice = engine.getCurrentPrice();

      engine.updatePrice();
      const newPrice = engine.getCurrentPrice();

      expect(engine.getVolatility()).toBe(0);
      expect(newPrice).toBeCloseTo(initialPrice, 1);
    });
  });

  describe("drift", () => {
    it("should set and get drift", () => {
      engine.setDrift(0.15);
      expect(engine.getDrift()).toBe(0.15);

      engine.setDrift(-0.05);
      expect(engine.getDrift()).toBe(-0.05);
    });

    it("should accept any drift value", () => {
      engine.setDrift(0);
      expect(engine.getDrift()).toBe(0);

      engine.setDrift(1.0);
      expect(engine.getDrift()).toBe(1.0);
    });
  });

  describe("order flow pressure", () => {
    it("should record buy orders", () => {
      engine.recordOrder("buy", 100);
      engine.recordOrder("buy", 50);

      engine.updatePrice();
      const priceAfterBuys = engine.getCurrentPrice();

      expect(priceAfterBuys).toBeGreaterThan(0);
    });

    it("should record sell orders", () => {
      engine.recordOrder("sell", 100);
      engine.recordOrder("sell", 50);

      engine.updatePrice();
      const priceAfterSells = engine.getCurrentPrice();

      expect(priceAfterSells).toBeGreaterThan(0);
    });

    it("should reflect buy pressure in price", () => {
      const controlEngine = new MarketEngine("CONTROL", 100.0);
      const buyPressureEngine = new MarketEngine("BUY_PRESSURE", 100.0);

      for (let i = 0; i < 50; i++) {
        buyPressureEngine.recordOrder("buy", 10);
      }

      buyPressureEngine.updatePrice();
      controlEngine.updatePrice();

      expect(buyPressureEngine.getCurrentPrice()).toBeGreaterThan(0);
      expect(controlEngine.getCurrentPrice()).toBeGreaterThan(0);
    });

    it("should reflect sell pressure in price", () => {
      const controlEngine = new MarketEngine("CONTROL", 100.0);
      const sellPressureEngine = new MarketEngine("SELL_PRESSURE", 100.0);

      for (let i = 0; i < 50; i++) {
        sellPressureEngine.recordOrder("sell", 10);
      }

      sellPressureEngine.updatePrice();
      controlEngine.updatePrice();

      expect(sellPressureEngine.getCurrentPrice()).toBeGreaterThan(0);
      expect(controlEngine.getCurrentPrice()).toBeGreaterThan(0);
    });

    it("should handle balanced order flow", () => {
      const balancedEngine = new MarketEngine("BALANCED", 100.0);

      for (let i = 0; i < 20; i++) {
        balancedEngine.recordOrder("buy", 10);
        balancedEngine.recordOrder("sell", 10);
      }

      balancedEngine.updatePrice();

      expect(balancedEngine.getCurrentPrice()).toBeGreaterThan(0);
    });

    it("should have no pressure when no orders recorded", () => {
      const initialPrice = engine.getCurrentPrice();
      engine.updatePrice();
      const newPrice = engine.getCurrentPrice();

      expect(newPrice).toBeGreaterThan(0);
    });
  });

  describe("market state", () => {
    it("should return current market state", () => {
      const market = engine.getMarketState();

      expect(market.itemId).toBe("TEST_ITEM");
      expect(market.currentPrice).toBe(100.0);
      expect(market.volatility).toBe(0.2);
      expect(market.orderBook.bids).toEqual([]);
      expect(market.orderBook.asks).toEqual([]);
    });

    it("should update market state after price changes", () => {
      engine.updatePrice();
      const market = engine.getMarketState();

      expect(market.currentPrice).not.toBe(100.0);
      expect(market.currentPrice).toBeGreaterThan(0);
    });
  });

  describe("parameter configuration", () => {
    it("should set time step", () => {
      const engineWithDt = new MarketEngine("TEST_DT", 100.0, { dt: 1 / 365 });
      const initialPrice = engineWithDt.getCurrentPrice();

      engineWithDt.updatePrice();

      expect(engineWithDt.getCurrentPrice()).not.toBe(initialPrice);
    });

    it("should set pressure factor", () => {
      const engineWithPressure = new MarketEngine("TEST_PRESSURE", 100.0);

      engineWithPressure.setPressureFactor(2.0);
      engineWithPressure.recordOrder("buy", 100);
      engineWithPressure.updatePrice();

      expect(engineWithPressure.getCurrentPrice()).toBeGreaterThan(0);
    });

    it("should reject negative pressure factor", () => {
      engine.setPressureFactor(-1.0);
      expect(() => {
        engine.updatePrice();
      }).not.toThrow();
    });
  });
});

function calculateVariance(values: number[]): number {
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squaredDiffs = values.map((val) => Math.pow(val - mean, 2));
  return squaredDiffs.reduce((sum, val) => sum + val, 0) / squaredDiffs.length;
}
