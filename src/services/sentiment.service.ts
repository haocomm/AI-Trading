import axios from 'axios';
import { DatabaseService } from '../models/database';
import { Logger } from '../utils/logger';

export interface SentimentData {
  timestamp: number;
  source: 'twitter' | 'reddit' | 'news' | 'telegram' | 'discord' | 'glassnode' | 'feargreed';
  symbol: string;
  sentiment: number; // -1 to 1 (negative to positive)
  confidence: number; // 0 to 1
  volume: number; // mention volume
  content?: string;
  metadata?: Record<string, any>;
}

export interface SentimentAnalysis {
  symbol: string;
  overall: {
    score: number; // -1 to 1
    confidence: number; // 0 to 1
    trend: 'improving' | 'declining' | 'stable';
    volume: number;
  };
  sources: {
    twitter: SentimentData[];
    reddit: SentimentData[];
    news: SentimentData[];
    telegram: SentimentData[];
    discord: SentimentData[];
    onchain: SentimentData[];
  };
  fearGreedIndex: {
    value: number;
    classification: 'extreme fear' | 'fear' | 'neutral' | 'greed' | 'extreme greed';
    timestamp: number;
  };
  technicalSentiment: {
    score: number;
    signals: string[];
    confidence: number;
  };
}

export interface FearGreedIndex {
  value: number;
  value_classification: string;
  timestamp: string;
  time_until_update: string;
}

export class SentimentAnalysisService {
  private dbService: DatabaseService;
  private logger = Logger.getInstance();
  private apiKeys: {
    twitter?: string;
    reddit?: string;
    news?: string;
    telegram?: string;
  };
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  constructor(dbService: DatabaseService) {
    this.dbService = dbService;
    this.loadApiKeys();
  }

  /**
   * Start continuous sentiment monitoring
   */
  public async startMonitoring(symbols: string[], intervalMinutes: number = 15): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Sentiment monitoring already running', {
        service: 'SentimentAnalysisService'
      });
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting sentiment monitoring', {
      symbols,
      interval: intervalMinutes,
      service: 'SentimentAnalysisService'
    });

    // Initial analysis
    await this.updateSentimentData(symbols);

    // Set up recurring updates
    this.updateInterval = setInterval(
      () => this.updateSentimentData(symbols),
      intervalMinutes * 60 * 1000
    );
  }

  /**
   * Stop sentiment monitoring
   */
  public async stopMonitoring(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;

    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    this.logger.info('Sentiment monitoring stopped', {
      service: 'SentimentAnalysisService'
    });
  }

  /**
   * Get comprehensive sentiment analysis for a symbol
   */
  public async getSentimentAnalysis(symbol: string, timeframe: string = '24h'): Promise<SentimentAnalysis> {
    this.logger.info('Getting sentiment analysis', {
      symbol,
      timeframe,
      service: 'SentimentAnalysisService'
    });

    try {
      // Get sentiment data from database
      const sentimentData = await this.getRecentSentimentData(symbol, timeframe);

      // Get Fear & Greed Index
      const fearGreedData = await this.getFearGreedIndex();

      // Get technical sentiment
      const technicalSentiment = await this.getTechnicalSentiment(symbol);

      // Calculate overall sentiment
      const overall = this.calculateOverallSentiment(sentimentData);

      const analysis: SentimentAnalysis = {
        symbol,
        overall,
        sources: {
          twitter: sentimentData.filter(d => d.source === 'twitter'),
          reddit: sentimentData.filter(d => d.source === 'reddit'),
          news: sentimentData.filter(d => d.source === 'news'),
          telegram: sentimentData.filter(d => d.source === 'telegram'),
          discord: sentimentData.filter(d => d.source === 'discord'),
          onchain: sentimentData.filter(d => d.source === 'glassnode')
        },
        fearGreedIndex: {
          value: fearGreedData.value,
          classification: fearGreedData.value_classification as any,
          timestamp: new Date(fearGreedData.timestamp).getTime()
        },
        technicalSentiment
      };

      // Save analysis to database
      await this.saveSentimentAnalysis(analysis);

      return analysis;
    } catch (error) {
      this.logger.error('Failed to get sentiment analysis', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      throw error;
    }
  }

  /**
   * Get sentiment trend over time
   */
  public async getSentimentTrend(
    symbol: string,
    hours: number = 24
  ): Promise<{ timestamp: number; score: number; volume: number; }[]> {
    try {
      const data = await this.dbService.getSentimentTrend(symbol, hours);

      return data.map(item => ({
        timestamp: item.timestamp,
        score: item.sentiment_score,
        volume: item.mention_volume
      }));
    } catch (error) {
      this.logger.error('Failed to get sentiment trend', {
        symbol,
        hours,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      throw error;
    }
  }

  /**
   * Get Fear & Greed Index
   */
  public async getFearGreedIndex(): Promise<FearGreedIndex> {
    try {
      const response = await axios.get('https://api.alternative.me/fng/', {
        timeout: 10000,
        headers: {
          'User-Agent': 'AI-Trading-Platform/1.0'
        }
      });

      const data = response.data;
      if (data && data.data && data.data[0]) {
        return data.data[0];
      }

      throw new Error('Invalid Fear & Greed Index response');
    } catch (error) {
      this.logger.error('Failed to get Fear & Greed Index', {
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });

      // Return fallback data
      return {
        value: 50,
        value_classification: 'neutral',
        timestamp: new Date().toISOString(),
        time_until_update: 'Unknown'
      };
    }
  }

  /**
   * Get social media sentiment for a symbol
   */
  public async getSocialMediaSentiment(symbol: string): Promise<SentimentData[]> {
    const sentiments: SentimentData[] = [];

    try {
      // Twitter sentiment (if API key available)
      if (this.apiKeys.twitter) {
        const twitterSentiments = await this.getTwitterSentiment(symbol);
        sentiments.push(...twitterSentiments);
      }

      // Reddit sentiment (if API key available)
      if (this.apiKeys.reddit) {
        const redditSentiments = await this.getRedditSentiment(symbol);
        sentiments.push(...redditSentiments);
      }

      // News sentiment
      const newsSentiments = await this.getNewsSentiment(symbol);
      sentiments.push(...newsSentiments);

      return sentiments;
    } catch (error) {
      this.logger.error('Failed to get social media sentiment', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      return [];
    }
  }

  /**
   * Get on-chain sentiment data
   */
  public async getOnChainSentiment(symbol: string): Promise<SentimentData[]> {
    try {
      // For demo purposes, using mock on-chain data
      // In production, integrate with Glassnode, CryptoQuant, or similar
      const onChainData: SentimentData[] = [
        {
          timestamp: Date.now(),
          source: 'glassnode',
          symbol,
          sentiment: Math.random() * 2 - 1, // -1 to 1
          confidence: 0.7,
          volume: Math.floor(Math.random() * 1000),
          metadata: {
            metric: 'exchange_inflow',
            value: Math.random() * 1000000
          }
        }
      ];

      return onChainData;
    } catch (error) {
      this.logger.error('Failed to get on-chain sentiment', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      return [];
    }
  }

  private async updateSentimentData(symbols: string[]): Promise<void> {
    for (const symbol of symbols) {
      try {
        // Get social media sentiment
        const socialSentiments = await this.getSocialMediaSentiment(symbol);

        // Get on-chain sentiment
        const onChainSentiments = await this.getOnChainSentiment(symbol);

        // Combine and save
        const allSentiments = [...socialSentiments, ...onChainSentiments];

        for (const sentiment of allSentiments) {
          await this.dbService.saveSentimentData(sentiment);
        }

        this.logger.debug('Sentiment data updated', {
          symbol,
          dataPoints: allSentiments.length,
          service: 'SentimentAnalysisService'
        });
      } catch (error) {
        this.logger.error('Failed to update sentiment data', {
          symbol,
          error: (error as Error).message,
          service: 'SentimentAnalysisService'
        });
      }
    }
  }

  private async getTwitterSentiment(symbol: string): Promise<SentimentData[]> {
    // Mock implementation - would use Twitter API in production
    const sentiments: SentimentData[] = [];

    try {
      // Simulate API calls with mock data
      const mockTweets = [
        { text: 'Bullish on BTC! 🚀', sentiment: 0.8, volume: 150 },
        { text: 'Bitcoin looking strong today', sentiment: 0.6, volume: 200 },
        { text: 'Concerned about BTC volatility', sentiment: -0.4, volume: 100 }
      ];

      for (const tweet of mockTweets) {
        sentiments.push({
          timestamp: Date.now(),
          source: 'twitter',
          symbol,
          sentiment: tweet.sentiment,
          confidence: 0.75,
          volume: tweet.volume,
          content: tweet.text
        });
      }

      return sentiments;
    } catch (error) {
      this.logger.error('Failed to get Twitter sentiment', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      return [];
    }
  }

  private async getRedditSentiment(symbol: string): Promise<SentimentData[]> {
    // Mock implementation - would use Reddit API in production
    const sentiments: SentimentData[] = [];

    try {
      const mockPosts = [
        { title: 'BTC reaching new highs!', sentiment: 0.9, volume: 500 },
        { text: 'Is Bitcoin overvalued?', sentiment: -0.2, volume: 300 }
      ];

      for (const post of mockPosts) {
        sentiments.push({
          timestamp: Date.now(),
          source: 'reddit',
          symbol,
          sentiment: post.sentiment,
          confidence: 0.7,
          volume: post.volume,
          content: post.title || post.text
        });
      }

      return sentiments;
    } catch (error) {
      this.logger.error('Failed to get Reddit sentiment', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      return [];
    }
  }

  private async getNewsSentiment(symbol: string): Promise<SentimentData[]> {
    try {
      // Use NewsAPI or similar for real news sentiment
      const mockNews = [
        {
          title: 'Bitcoin Adoption Continues to Grow',
          sentiment: 0.7,
          confidence: 0.85,
          volume: 1000
        },
        {
          title: 'Regulatory Concerns Impact Crypto Markets',
          sentiment: -0.3,
          confidence: 0.9,
          volume: 800
        }
      ];

      return mockNews.map(news => ({
        timestamp: Date.now(),
        source: 'news',
        symbol,
        sentiment: news.sentiment,
        confidence: news.confidence,
        volume: news.volume,
        content: news.title
      }));
    } catch (error) {
      this.logger.error('Failed to get news sentiment', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
      return [];
    }
  }

  private async getTechnicalSentiment(symbol: string): Promise<SentimentAnalysis['technicalSentiment']> {
    try {
      // Get recent price data and technical indicators
      const technicalData = await this.dbService.getTechnicalIndicators(symbol, '1h', 24);

      // Analyze technical signals
      const signals: string[] = [];
      let score = 0;

      // RSI analysis
      const rsi = technicalData.rsi?.[technicalData.rsi.length - 1] || 50;
      if (rsi < 30) {
        signals.push('RSI oversold');
        score += 0.3;
      } else if (rsi > 70) {
        signals.push('RSI overbought');
        score -= 0.3;
      }

      // Moving average analysis
      const sma20 = technicalData.sma20?.[technicalData.sma20.length - 1];
      const sma50 = technicalData.sma50?.[technicalData.sma50.length - 1];
      const currentPrice = technicalData.close?.[technicalData.close.length - 1];

      if (sma20 && sma50 && currentPrice) {
        if (sma20 > sma50) {
          signals.push('Short-term bullish');
          score += 0.2;
        } else {
          signals.push('Short-term bearish');
          score -= 0.2;
        }

        if (currentPrice > sma20) {
          signals.push('Price above short MA');
          score += 0.1;
        }
      }

      // Volume analysis
      const volume = technicalData.volume?.[technicalData.volume.length - 1];
      const avgVolume = technicalData.volume?.slice(-20).reduce((a: number, b: number) => a + b, 0) / 20;

      if (volume && avgVolume && volume > avgVolume * 1.5) {
        signals.push('High volume');
        score += 0.1;
      }

      return {
        score: Math.max(-1, Math.min(1, score)),
        signals,
        confidence: 0.8
      };
    } catch (error) {
      this.logger.error('Failed to get technical sentiment', {
        symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });

      return {
        score: 0,
        signals: ['Technical analysis unavailable'],
        confidence: 0
      };
    }
  }

  private calculateOverallSentiment(sentimentData: SentimentData[]): SentimentAnalysis['overall'] {
    if (sentimentData.length === 0) {
      return {
        score: 0,
        confidence: 0,
        trend: 'stable',
        volume: 0
      };
    }

    // Calculate weighted sentiment
    let weightedSum = 0;
    let totalWeight = 0;
    let totalVolume = 0;

    for (const data of sentimentData) {
      const weight = data.confidence * Math.log(data.volume + 1);
      weightedSum += data.sentiment * weight;
      totalWeight += weight;
      totalVolume += data.volume;
    }

    const overallScore = totalWeight > 0 ? weightedSum / totalWeight : 0;
    const overallConfidence = Math.min(1, totalWeight / (sentimentData.length * 10));

    // Determine trend
    const recentData = sentimentData.slice(-5);
    const olderData = sentimentData.slice(-10, -5);

    const recentAvg = recentData.length > 0
      ? recentData.reduce((sum, d) => sum + d.sentiment, 0) / recentData.length
      : 0;

    const olderAvg = olderData.length > 0
      ? olderData.reduce((sum, d) => sum + d.sentiment, 0) / olderData.length
      : 0;

    let trend: 'improving' | 'declining' | 'stable';
    if (recentAvg > olderAvg + 0.1) {
      trend = 'improving';
    } else if (recentAvg < olderAvg - 0.1) {
      trend = 'declining';
    } else {
      trend = 'stable';
    }

    return {
      score: overallScore,
      confidence: overallConfidence,
      trend,
      volume: totalVolume
    };
  }

  private async getRecentSentimentData(symbol: string, timeframe: string): Promise<SentimentData[]> {
    const hours = timeframe === '1h' ? 1 : timeframe === '6h' ? 6 : timeframe === '24h' ? 24 : 24;
    return await this.dbService.getRecentSentimentData(symbol, hours);
  }

  private async saveSentimentAnalysis(analysis: SentimentAnalysis): Promise<void> {
    try {
      await this.dbService.saveSentimentAnalysis(analysis);

      this.logger.debug('Sentiment analysis saved', {
        symbol: analysis.symbol,
        overallScore: analysis.overall.score,
        confidence: analysis.overall.confidence,
        service: 'SentimentAnalysisService'
      });
    } catch (error) {
      this.logger.error('Failed to save sentiment analysis', {
        symbol: analysis.symbol,
        error: (error as Error).message,
        service: 'SentimentAnalysisService'
      });
    }
  }

  private loadApiKeys(): void {
    this.apiKeys = {
      twitter: process.env.TWITTER_API_KEY,
      reddit: process.env.REDDIT_API_KEY,
      news: process.env.NEWS_API_KEY,
      telegram: process.env.TELEGRAM_BOT_TOKEN
    };
  }

  public async cleanup(): Promise<void> {
    await this.stopMonitoring();
    this.logger.info('SentimentAnalysisService cleanup completed', {
      service: 'SentimentAnalysisService'
    });
  }
}