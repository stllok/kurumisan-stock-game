import { describe, it, expect } from 'bun:test';
import { PlayerSession, createPlayerSession } from '../player-session';

describe('PlayerSession', () => {
  describe('Construction and Factory', () => {
    it('should create a player session with default balance', () => {
      const session = new PlayerSession('player-1');
      expect(session.getPlayerId()).toBe('player-1');
      expect(session.getBalance()).toBe(0);
      expect(session.getAllInventory()).toEqual(new Map());
    });

    it('should create a player session with initial balance', () => {
      const session = new PlayerSession('player-2', 1000);
      expect(session.getPlayerId()).toBe('player-2');
      expect(session.getBalance()).toBe(1000);
    });

    it('should create player session via factory function', () => {
      const session = createPlayerSession('player-3', 500);
      expect(session.getPlayerId()).toBe('player-3');
      expect(session.getBalance()).toBe(500);
    });
  });

  describe('Balance Management', () => {
    it('should get current balance', () => {
      const session = new PlayerSession('player-1', 1000);
      expect(session.getBalance()).toBe(1000);
    });

    it('should update balance by adding funds', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateBalance(500);
      expect(session.getBalance()).toBe(1500);
    });

    it('should update balance by subtracting funds', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateBalance(-500);
      expect(session.getBalance()).toBe(500);
    });

    it('should update balance to zero', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateBalance(-1000);
      expect(session.getBalance()).toBe(0);
    });

    it('should throw error when updating balance to negative', () => {
      const session = new PlayerSession('player-1', 100);
      expect(() => session.updateBalance(-101)).toThrow('Insufficient balance');
      expect(session.getBalance()).toBe(100);
    });

    it('should throw error when updating from zero to negative', () => {
      const session = new PlayerSession('player-1', 0);
      expect(() => session.updateBalance(-1)).toThrow('Insufficient balance');
      expect(session.getBalance()).toBe(0);
    });

    it('should handle multiple balance updates', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateBalance(500);
      session.updateBalance(-200);
      session.updateBalance(100);
      expect(session.getBalance()).toBe(1400);
    });

    it('should check sufficient balance when enough funds', () => {
      const session = new PlayerSession('player-1', 1000);
      expect(session.hasSufficientBalance(500)).toBe(true);
      expect(session.hasSufficientBalance(1000)).toBe(true);
    });

    it('should check sufficient balance when insufficient funds', () => {
      const session = new PlayerSession('player-1', 1000);
      expect(session.hasSufficientBalance(1001)).toBe(false);
      expect(session.hasSufficientBalance(5000)).toBe(false);
    });

    it('should have sufficient balance for zero amount', () => {
      const session = new PlayerSession('player-1', 0);
      expect(session.hasSufficientBalance(0)).toBe(true);
    });
  });

  describe('Inventory Management', () => {
    it('should get item quantity when item not in inventory', () => {
      const session = new PlayerSession('player-1');
      expect(session.getInventory('item-1')).toBe(0);
    });

    it('should get item quantity when item exists', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      expect(session.getInventory('item-1')).toBe(10);
    });

    it('should add items to inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      session.updateInventory('item-2', 5);
      expect(session.getInventory('item-1')).toBe(10);
      expect(session.getInventory('item-2')).toBe(5);
    });

    it('should remove items from inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      session.updateInventory('item-1', -3);
      expect(session.getInventory('item-1')).toBe(7);
    });

    it('should add items to existing inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 5);
      session.updateInventory('item-1', 3);
      expect(session.getInventory('item-1')).toBe(8);
    });

    it('should remove all items from inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      session.updateInventory('item-1', -10);
      expect(session.getInventory('item-1')).toBe(0);
      expect(session.getAllInventory().has('item-1')).toBe(false);
    });

    it('should throw error when removing items to negative', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 5);
      expect(() => session.updateInventory('item-1', -6)).toThrow('Insufficient inventory');
      expect(session.getInventory('item-1')).toBe(5);
    });

    it('should throw error when removing from empty inventory', () => {
      const session = new PlayerSession('player-1');
      expect(() => session.updateInventory('item-1', -1)).toThrow('Insufficient inventory');
      expect(session.getInventory('item-1')).toBe(0);
    });

    it('should handle multiple inventory updates', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      session.updateInventory('item-1', -5);
      session.updateInventory('item-1', 3);
      expect(session.getInventory('item-1')).toBe(8);
    });

    it('should check sufficient inventory when enough items', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      expect(session.hasSufficientInventory('item-1', 5)).toBe(true);
      expect(session.hasSufficientInventory('item-1', 10)).toBe(true);
    });

    it('should check sufficient inventory when insufficient items', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      expect(session.hasSufficientInventory('item-1', 11)).toBe(false);
      expect(session.hasSufficientInventory('item-1', 50)).toBe(false);
    });

    it('should have sufficient inventory for zero quantity', () => {
      const session = new PlayerSession('player-1');
      expect(session.hasSufficientInventory('item-1', 0)).toBe(true);
    });

    it('should not have sufficient inventory for non-existent item', () => {
      const session = new PlayerSession('player-1');
      expect(session.hasSufficientInventory('item-1', 1)).toBe(false);
    });
  });

  describe('Validation', () => {
    it('should prevent negative balance updates', () => {
      const session = new PlayerSession('player-1', 100);
      const attempts = [-101, -200, -1000];
      attempts.forEach((delta) => {
        expect(() => session.updateBalance(delta)).toThrow('Insufficient balance');
      });
      expect(session.getBalance()).toBe(100);
    });

    it('should prevent negative inventory updates', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      const attempts = [-11, -20, -100];
      attempts.forEach((delta) => {
        expect(() => session.updateInventory('item-1', delta)).toThrow('Insufficient inventory');
      });
      expect(session.getInventory('item-1')).toBe(10);
    });

    it('should allow zero balance', () => {
      const session = new PlayerSession('player-1', 0);
      expect(session.getBalance()).toBe(0);
      session.updateBalance(100);
      session.updateBalance(-100);
      expect(session.getBalance()).toBe(0);
    });

    it('should allow zero inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      session.updateInventory('item-1', -10);
      expect(session.getInventory('item-1')).toBe(0);
    });
  });

  describe('Defensive Copying', () => {
    it('should return a copy of all inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      const inventory = session.getAllInventory();
      inventory.set('item-2', 20);
      expect(session.getInventory('item-1')).toBe(10);
      expect(session.getInventory('item-2')).toBe(0);
    });

    it('should return a copy of state', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      const state = session.getState();
      state.balance = 500;
      state.inventory.set('item-2', 20);
      expect(session.getBalance()).toBe(1000);
      expect(session.getInventory('item-1')).toBe(10);
      expect(session.getInventory('item-2')).toBe(0);
    });

    it('should return a copy of player', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      const player = session.toPlayer();
      player.balance = 500;
      player.inventory.set('item-2', 20);
      expect(session.getBalance()).toBe(1000);
      expect(session.getInventory('item-1')).toBe(10);
      expect(session.getInventory('item-2')).toBe(0);
    });

    it('should not be affected by mutating returned inventory', () => {
      const session = new PlayerSession('player-1');
      session.updateInventory('item-1', 10);
      const inventory = session.getAllInventory();
      inventory.delete('item-1');
      expect(session.getInventory('item-1')).toBe(10);
    });
  });

  describe('State Management', () => {
    it('should get complete state', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      session.updateInventory('item-2', 5);
      const state = session.getState();
      expect(state.balance).toBe(1000);
      expect(state.inventory.get('item-1')).toBe(10);
      expect(state.inventory.get('item-2')).toBe(5);
    });

    it('should set state', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      const newState = {
        balance: 500,
        inventory: new Map([['item-2', 20]]),
      };
      session.setState(newState);
      expect(session.getBalance()).toBe(500);
      expect(session.getInventory('item-1')).toBe(0);
      expect(session.getInventory('item-2')).toBe(20);
    });

    it('should set state with empty inventory', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      const newState = {
        balance: 500,
        inventory: new Map(),
      };
      session.setState(newState);
      expect(session.getBalance()).toBe(500);
      expect(session.getAllInventory()).toEqual(new Map());
    });

    it('should set state without affecting original', () => {
      const session = new PlayerSession('player-1', 1000);
      const newState = {
        balance: 500,
        inventory: new Map([['item-1', 10]]),
      };
      session.setState(newState);
      newState.balance = 200;
      newState.inventory.set('item-2', 20);
      expect(session.getBalance()).toBe(500);
      expect(session.getInventory('item-2')).toBe(0);
    });
  });

  describe('toPlayer', () => {
    it('should convert to player format', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      const player = session.toPlayer();
      expect(player.id).toBe('player-1');
      expect(player.balance).toBe(1000);
      expect(player.inventory.get('item-1')).toBe(10);
    });

    it('should return player with empty inventory', () => {
      const session = new PlayerSession('player-1', 1000);
      const player = session.toPlayer();
      expect(player.inventory).toEqual(new Map());
    });
  });

  describe('Integration Scenarios', () => {
    it('should handle buy transaction (add items, remove balance)', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateBalance(-500);
      session.updateInventory('item-1', 10);
      expect(session.getBalance()).toBe(500);
      expect(session.getInventory('item-1')).toBe(10);
    });

    it('should handle sell transaction (remove items, add balance)', () => {
      const session = new PlayerSession('player-1', 0);
      session.updateInventory('item-1', 10);
      session.updateInventory('item-1', -10);
      session.updateBalance(500);
      expect(session.getBalance()).toBe(500);
      expect(session.getInventory('item-1')).toBe(0);
    });

    it('should validate before transaction', () => {
      const session = new PlayerSession('player-1', 100);
      expect(session.hasSufficientBalance(100)).toBe(true);
      expect(session.hasSufficientBalance(101)).toBe(false);
      session.updateBalance(-100);
      expect(session.hasSufficientBalance(1)).toBe(false);
    });

    it('should handle multiple items in inventory', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      session.updateInventory('item-2', 20);
      session.updateInventory('item-3', 5);
      expect(session.getAllInventory().size).toBe(3);
      expect(session.hasSufficientInventory('item-1', 10)).toBe(true);
      expect(session.hasSufficientInventory('item-2', 20)).toBe(true);
      expect(session.hasSufficientInventory('item-3', 5)).toBe(true);
    });

    it('should reset state via setState', () => {
      const session = new PlayerSession('player-1', 1000);
      session.updateInventory('item-1', 10);
      session.updateInventory('item-2', 20);
      session.setState({
        balance: 0,
        inventory: new Map(),
      });
      expect(session.getBalance()).toBe(0);
      expect(session.getAllInventory()).toEqual(new Map());
    });
  });
});
