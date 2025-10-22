#!/usr/bin/env node

/**
 * AI Trading Bot Launcher
 * Handles module resolution and starts the AI trading system
 */

const path = require('path');
const fs = require('fs');

console.log('🚀 AI Trading Platform - Advanced Launcher');
console.log('📍 Working Directory:', process.cwd());

// Set up module resolution for compiled JavaScript
const originalRequire = require;
require = function(id) {
  // Handle @/ aliases for compiled JS
  if (id.startsWith('@/')) {
    const srcPath = id.replace('@/', './src/');
    console.log(`🔗 Resolving ${id} -> ${srcPath}`);
    return originalRequire(path.resolve(process.cwd(), srcPath));
  }
  return originalRequire(id);
};

// Load environment configuration
function loadEnvironment() {
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    console.log('✅ Environment file found');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      if (line.trim() && !line.startsWith('#')) {
        const [key, ...value] = line.split('=');
        if (key && value.length > 0) {
          process.env[key.trim()] = value.join('=').trim();
        }
      }
    });

    // Check critical API keys
    const hasGemini = process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here';
    const hasBinance = process.env.BINANCE_API_KEY && process.env.BINANCE_API_KEY !== 'your_binance_api_key_here';

    console.log('🔑 API Configuration Status:');
    console.log(`   Gemini API: ${hasGemini ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Binance API: ${hasBinance ? '✅ Configured' : '❌ Missing'}`);
    console.log(`   Trading Enabled: ${process.env.TRADING_ENABLED === 'true' ? '🟢 LIVE' : '📊 PAPER'}`);

    return hasGemini && hasBinance;
  } else {
    console.log('⚠️  No .env file found - using defaults');
    return false;
  }
}

// Start the AI trading system
async function startTradingBot() {
  try {
    const envLoaded = loadEnvironment();

    if (!envLoaded) {
      console.log('❌ Cannot start without proper API configuration');
      console.log('📝 Please edit .env file with your API keys');
      process.exit(1);
    }

    console.log('🚀 Starting AI Trading System...');

    // Load and start the main application
    const mainApp = require('./dist/index.js');

    // Graceful shutdown handlers
    process.on('SIGINT', () => {
      console.log('\n🛑 SIGINT received - Shutting down gracefully...');
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      console.log('\n🛑 SIGTERM received - Shutting down gracefully...');
      process.exit(0);
    });

    // Start the application
    if (mainApp && typeof mainApp.default === 'function') {
      await mainApp.default();
    } else {
      console.error('❌ Failed to load main application');
      process.exit(1);
    }

  } catch (error) {
    console.error('💥 Fatal Error:', error.message);
    console.error('Stack:', error.stack);
    process.exit(1);
  }
}

// Start the bot
startTradingBot();