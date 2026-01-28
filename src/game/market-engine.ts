/**
 * Market Engine - GBM (Geometric Brownian Motion) price simulation with order flow pressure
 *
 * Implements procedural pricing using:
 * - GBM formula for price dynamics
 * - Box-Muller transform for normal distribution
 * - Order flow pressure for buy/sell imbalance
 */

import type { Market, OrderSide } from './types';

/**
 * Configuration for market engine parameters
 */
export interface MarketEngineConfig {
  drift: number;
  volatility: number;
  dt: number;
  baseAdjustment: number;
  pressureFactor: number;
  timeWindow: number;
}

/**
 * Market Engine implementing GBM price simulation with order flow pressure
 */
export class MarketEngine {
  private config: MarketEngineConfig;
  private currentPrice: number;
  private itemId: string;
  private buyVolume: number = 0;
  private sellVolume: number = 0;
  private orderTimestamps: number[] = [];

  /**
   * Initialize market engine
   * @param itemId - The item/market identifier
   * @param initialPrice - Starting price
   * @param config - Engine configuration
   */
  constructor(itemId: string, initialPrice: number, config?: Partial<MarketEngineConfig>) {
    this.itemId = itemId;
    this.currentPrice = initialPrice;

    this.config = {
      drift: 0.08,
      volatility: 0.2,
      dt: 1 / 252,
      baseAdjustment: 0.01,
      pressureFactor: 1.0,
      timeWindow: 60000,
      ...config,
    };
  }

  /**
   * Generate standard normal random variable using Box-Muller transform
   * @returns Random value from N(0,1) distribution
   *
   * Box-Muller formula:
   * z0 = sqrt(-2 * ln(u1)) * cos(2π * u2)
   * z1 = sqrt(-2 * ln(u1)) * sin(2π * u2)
   * where u1, u2 are uniform(0,1) random numbers
   */
  private boxMullerTransform(): number {
    let u1: number;
    let u2: number;

    do {
      u1 = Math.random();
    } while (u1 <= 0.00001);

    u2 = Math.random();

    const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);

    return z0;
  }

  /**
   * Calculate order flow pressure
   * @returns Pressure value (positive for buy pressure, negative for sell pressure)
   *
   * Formula: pressure = (buyVolume - sellVolume) / timeWindow
   */
  private calculateOrderFlowPressure(): number {
    if (this.orderTimestamps.length === 0) {
      return 0;
    }

    const now = Date.now();
    const windowStart = now - this.config.timeWindow;

    let recentBuyVolume = 0;
    let recentSellVolume = 0;

    this.orderTimestamps = this.orderTimestamps.filter((timestamp) => timestamp >= windowStart);

    recentBuyVolume = this.buyVolume;
    recentSellVolume = this.sellVolume;

    this.buyVolume = 0;
    this.sellVolume = 0;

    const totalVolume = recentBuyVolume + recentSellVolume;
    if (totalVolume === 0) {
      return 0;
    }

    return (recentBuyVolume - recentSellVolume) / totalVolume;
  }

  /**
   * Update price using GBM formula with order flow pressure adjustment
   *
   * GBM formula:
   * S(t+1) = S(t) * exp((μ - σ²/2) * dt + σ * ε * sqrt(dt))
   *
   * Order flow adjustment:
   * priceAdjustment = baseAdjustment * pressureFactor * pressure
   * finalPrice = S(t+1) * (1 + priceAdjustment)
   */
  updatePrice(): void {
    const mu = this.config.drift;
    const sigma = this.config.volatility;
    const dt = this.config.dt;

    const pressure = this.calculateOrderFlowPressure();
    const epsilon = this.boxMullerTransform();

    const driftTerm = (mu - (sigma * sigma) / 2) * dt;
    const diffusionTerm = sigma * epsilon * Math.sqrt(dt);

    const logReturn = driftTerm + diffusionTerm;
    const gbmPrice = this.currentPrice * Math.exp(logReturn);

    const priceAdjustment = this.config.baseAdjustment * this.config.pressureFactor * pressure;
    const adjustedPrice = gbmPrice * (1 + priceAdjustment);

    this.currentPrice = Math.max(adjustedPrice, 0.01);
  }

  /**
   * Record an order for order flow pressure calculation
   * @param side - Buy or sell
   * @param volume - Order volume
   */
  recordOrder(side: OrderSide, volume: number): void {
    const now = Date.now();
    this.orderTimestamps.push(now);

    if (side === 'buy') {
      this.buyVolume += volume;
    } else {
      this.sellVolume += volume;
    }
  }

  /**
   * Get current market state
   * @returns Market object with current price and volatility
   */
  getMarketState(): Market {
    return {
      itemId: this.itemId,
      orderBook: { bids: [], asks: [] },
      currentPrice: this.currentPrice,
      volatility: this.config.volatility,
    };
  }

  /**
   * Get current price
   */
  getCurrentPrice(): number {
    return this.currentPrice;
  }

  /**
   * Set volatility (σ)
   * @param volatility - New volatility value (e.g., 0.2 for 20%)
   */
  setVolatility(volatility: number): void {
    this.config.volatility = Math.max(volatility, 0);
  }

  /**
   * Get current volatility
   */
  getVolatility(): number {
    return this.config.volatility;
  }

  /**
   * Set drift (μ)
   * @param drift - New drift value (e.g., 0.08 for 8%)
   */
  setDrift(drift: number): void {
    this.config.drift = drift;
  }

  /**
   * Get current drift
   */
  getDrift(): number {
    return this.config.drift;
  }

  /**
   * Set time step (dt)
   * @param dt - New time step (e.g., 1/252 for daily)
   */
  setTimeStep(dt: number): void {
    this.config.dt = Math.max(dt, 0);
  }

  /**
   * Set order flow pressure factor
   * @param factor - Pressure multiplier (higher = more impact)
   */
  setPressureFactor(factor: number): void {
    this.config.pressureFactor = Math.max(factor, 0);
  }
}
