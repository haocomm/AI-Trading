#!/usr/bin/env node

// Simple test script to verify AI trading system functionality
console.log('🚀 Starting AI Trading Platform Test...');
console.log('✅ Node.js version:', process.version);
console.log('✅ Working directory:', process.cwd());
console.log('✅ Environment loaded:', Object.keys(process.env).filter(k => k.includes('API_KEY')));

// Test core functionality
const testModules = [
  { name: 'Database', path: './src/models/database.js' },
  { name: 'Config', path: './src/config/index.js' },
  { name: 'Logger', path: './src/utils/logger.js' },
];

console.log('\n🔍 Testing Core Modules:');
testModules.forEach(module => {
  try {
    require.resolve(module.path);
    console.log(`✅ ${module.name}: Available`);
  } catch (error) {
    console.log(`❌ ${module.name}: Missing - ${error.message}`);
  }
});

console.log('\n🎯 AI Trading Platform Test Complete!');
console.log('📝 Next: Add API keys to .env and run: npm run dev');