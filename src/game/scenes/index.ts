import type Phaser from 'phaser';
import { BootScene } from './BootScene';
import { MainMenuScene } from './MainMenuScene';
import { MarketScene } from './MarketScene';
import { AuctionScene } from './AuctionScene';
import { WorkshopScene } from './WorkshopScene';
import { ShopScene } from './ShopScene';
import { SummaryScene } from './SummaryScene';
import { CatalogScene } from './CatalogScene';
import { DailyScene } from './DailyScene';
import { CompleteScene } from './CompleteScene';
import { PromoScene } from './PromoScene';
import { NameScene } from './NameScene';

export const SCENES: Array<typeof Phaser.Scene> = [
  BootScene,
  MainMenuScene,
  MarketScene,
  AuctionScene,
  WorkshopScene,
  ShopScene,
  SummaryScene,
  CatalogScene,
  DailyScene,
  CompleteScene,
  NameScene,
  // Store key art: only in E2E/dev builds.
  ...(__E2E__ ? [PromoScene] : []),
];
