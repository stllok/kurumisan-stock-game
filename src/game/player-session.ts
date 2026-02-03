/**
 * In-memory player session management
 *
 * PlayerSession instances are per-worker, not shared across workers
 * - Each worker must have its own PlayerSession instances for its state
 * - Cross-worker communication only via message passing (postMessage/onmessage)
 */

/**
 * Player session state for managing balance and inventory
 */
export interface PlayerSessionState {
  balance: number;
  inventory: Map<string, number>;
}

/**
 * Player session class with state management
 *
 * Uses plain object for state updates within a single worker
 * Prevents negative balances and inventory via validation
 */
export class PlayerSession {
  private state: PlayerSessionState;

  /**
   * Create a new player session
   * @param playerId - Unique player identifier
   * @param initialBalance - Starting balance (default: 0)
   */
  constructor(
    private readonly playerId: string,
    initialBalance: number = 0
  ) {
    this.state = {
      balance: initialBalance,
      inventory: new Map<string, number>(),
    };
  }

  /**
   * Get the player ID
   */
  getPlayerId(): string {
    return this.playerId;
  }

  /**
   * Get current balance
   */
  getBalance(): number {
    return this.state.balance;
  }

  /**
   * Update balance by adding/subtracting funds
   * @param delta - Amount to add (positive) or subtract (negative)
   * @throws Error if resulting balance would be negative
   */
  updateBalance(delta: number): void {
    const newBalance = this.state.balance + delta;

    if (newBalance < 0) {
      throw new Error(
        `Insufficient balance: cannot update from ${this.state.balance} to ${newBalance} (delta: ${delta})`
      );
    }

    this.state.balance = newBalance;
  }

  /**
   * Get quantity of a specific item in inventory
   * @param itemId - Item identifier
   * @returns Quantity (0 if item not in inventory)
   */
  getInventory(itemId: string): number {
    return this.state.inventory.get(itemId) ?? 0;
  }

  /**
   * Update inventory by adding/removing items
   * @param itemId - Item identifier
   * @param delta - Quantity to add (positive) or remove (negative)
   * @throws Error if resulting quantity would be negative
   */
  updateInventory(itemId: string, delta: number): void {
    const currentQuantity = this.state.inventory.get(itemId) ?? 0;
    const newQuantity = currentQuantity + delta;

    if (newQuantity < 0) {
      throw new Error(
        `Insufficient inventory: cannot update ${itemId} from ${currentQuantity} to ${newQuantity} (delta: ${delta})`
      );
    }

    if (newQuantity === 0) {
      this.state.inventory.delete(itemId);
    } else {
      this.state.inventory.set(itemId, newQuantity);
    }
  }

  /**
   * Check if player has sufficient balance for a transaction
   * @param amount - Required amount
   * @returns True if balance >= amount
   */
  hasSufficientBalance(amount: number): boolean {
    return this.getBalance() >= amount;
  }

  /**
   * Check if player has sufficient quantity of an item
   * @param itemId - Item identifier
   * @param quantity - Required quantity
   * @returns True if inventory >= quantity
   */
  hasSufficientInventory(itemId: string, quantity: number): boolean {
    return this.getInventory(itemId) >= quantity;
  }

  /**
   * Get all inventory items
   * @returns Copy of inventory map (defensive copy)
   */
  getAllInventory(): Map<string, number> {
    return new Map(this.state.inventory);
  }

  /**
   * Get complete player state
   * @returns Copy of player state (defensive copy)
   */
  getState(): PlayerSessionState {
    return {
      balance: this.state.balance,
      inventory: new Map(this.state.inventory),
    };
  }

  /**
   * Set player state (for initialization or reset)
   * @param newState - New state to set
   */
  setState(newState: PlayerSessionState): void {
    this.state = {
      balance: newState.balance,
      inventory: new Map(newState.inventory),
    };
  }

  /**
   * Get player data in Player interface format
   */
  toPlayer(): { id: string; balance: number; inventory: Map<string, number> } {
    return {
      id: this.playerId,
      balance: this.state.balance,
      inventory: new Map(this.state.inventory),
    };
  }
}

/**
 * Factory function to create a player session
 */
export function createPlayerSession(playerId: string, initialBalance: number = 0): PlayerSession {
  return new PlayerSession(playerId, initialBalance);
}
