-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'MERCHANT', 'EDITOR', 'ANALYST', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'deleted');

-- CreateEnum
CREATE TYPE "DataSource" AS ENUM ('api', 'feed', 'merchant_upload', 'affiliate', 'demo');

-- CreateEnum
CREATE TYPE "ProductCondition" AS ENUM ('new', 'refurbished', 'used', 'open_box');

-- CreateEnum
CREATE TYPE "StockStatus" AS ENUM ('in_stock', 'low_stock', 'out_of_stock', 'preorder', 'unknown');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('live', 'pending_configuration', 'error', 'disabled');

-- CreateEnum
CREATE TYPE "IntegrationKind" AS ENUM ('retailer_api', 'affiliate_network', 'product_feed', 'merchant_portal', 'travel_api');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'draft', 'archived');

-- CreateEnum
CREATE TYPE "IdentifierType" AS ENUM ('UPC', 'EAN', 'GTIN', 'ISBN', 'MPN', 'ASIN', 'SKU');

-- CreateEnum
CREATE TYPE "MatchStatus" AS ENUM ('auto_matched', 'pending_review', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "MatchMethod" AS ENUM ('gtin', 'brand_mpn', 'attributes', 'semantic', 'manual');

-- CreateEnum
CREATE TYPE "ReviewDecision" AS ENUM ('approve', 'reject', 'reassign');

-- CreateEnum
CREATE TYPE "AlertType" AS ENUM ('below_price', 'drop_percent', 'back_in_stock', 'new_cheaper_store', 'all_time_low', 'coupon');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('email', 'push', 'in_app');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('queued', 'processing', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "FeedFormat" AS ENUM ('csv', 'xml', 'json');

-- CreateEnum
CREATE TYPE "AffiliateNetwork" AS ENUM ('amazon_associates', 'cj', 'impact', 'awin', 'rakuten', 'ebay_partner', 'walmart', 'travelpayouts', 'booking', 'expedia', 'direct');

-- CreateEnum
CREATE TYPE "ConversionStatus" AS ENUM ('pending', 'approved', 'reversed');

-- CreateEnum
CREATE TYPE "CommissionStatus" AS ENUM ('pending', 'approved', 'paid', 'reversed');

-- CreateEnum
CREATE TYPE "CashbackStatus" AS ENUM ('pending', 'confirmed', 'reversed', 'payable', 'paid');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('trialing', 'active', 'past_due', 'canceled', 'incomplete');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('month', 'year');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'active', 'paused', 'ended');

-- CreateEnum
CREATE TYPE "DealStatus" AS ENUM ('pending', 'active', 'expired', 'rejected');

-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('visible', 'hidden', 'flagged');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'pending', 'verified', 'rejected');

-- CreateEnum
CREATE TYPE "ClickKind" AS ENUM ('product', 'flight', 'hotel');

-- CreateEnum
CREATE TYPE "AnomalyKind" AS ENUM ('price_spike', 'price_drop_outlier', 'stale_offer', 'fake_discount', 'feed_error');

-- CreateEnum
CREATE TYPE "Severity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "CabinClass" AS ENUM ('economy', 'premium_economy', 'business', 'first');

-- CreateEnum
CREATE TYPE "BoardType" AS ENUM ('room_only', 'breakfast', 'half_board', 'full_board', 'all_inclusive');

-- CreateEnum
CREATE TYPE "TravelAlertKind" AS ENUM ('flight', 'hotel');

-- CreateEnum
CREATE TYPE "ThemePreference" AS ENUM ('system', 'light', 'dark');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT,
    "name" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "emailVerifiedAt" TIMESTAMPTZ(3),
    "avatarUrl" TEXT,
    "lastLoginAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "revokedAt" TIMESTAMPTZ(3),

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "oauth_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "email" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "oauth_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "password_reset_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "userId" TEXT NOT NULL,
    "zip" TEXT,
    "favoriteRetailers" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "preferredCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "memberships" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notifyEmail" BOOLEAN NOT NULL DEFAULT true,
    "notifyPush" BOOLEAN NOT NULL DEFAULT false,
    "notifyPriceDrops" BOOLEAN NOT NULL DEFAULT true,
    "weeklyDigest" BOOLEAN NOT NULL DEFAULT false,
    "marketingOptIn" BOOLEAN NOT NULL DEFAULT false,
    "theme" "ThemePreference" NOT NULL DEFAULT 'system',
    "homeAirport" CHAR(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" CHAR(2) NOT NULL,
    "zip" TEXT NOT NULL,
    "country" CHAR(2) NOT NULL DEFAULT 'US',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "path" TEXT NOT NULL,
    "depth" INTEGER NOT NULL DEFAULT 0,
    "description" TEXT,
    "icon" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brands" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "website" TEXT,
    "logoUrl" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brands_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "brandId" TEXT,
    "categoryId" TEXT,
    "model" TEXT,
    "mpn" TEXT,
    "condition" "ProductCondition" NOT NULL DEFAULT 'new',
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "isDemo" BOOLEAN NOT NULL DEFAULT false,
    "releasedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_variants" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "familyKey" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "attributes" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_variants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_identifiers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "IdentifierType" NOT NULL,
    "value" TEXT NOT NULL,
    "retailerId" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_identifiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_attributes" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "group" TEXT,
    "name" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "unit" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "product_attributes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_images" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "alt" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "source" "DataSource" NOT NULL DEFAULT 'demo',

    CONSTRAINT "product_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailers" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "websiteUrl" TEXT NOT NULL,
    "logoUrl" TEXT,
    "brandColor" TEXT,
    "integrationStatus" "IntegrationStatus" NOT NULL DEFAULT 'pending_configuration',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "trustScore" INTEGER,
    "freeShippingThresholdCents" INTEGER,
    "membershipName" TEXT,
    "membershipKey" TEXT,
    "returnPolicyUrl" TEXT,
    "affiliateDisclosure" TEXT,
    "allowedRedirectHosts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retailers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_integrations" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "kind" "IntegrationKind" NOT NULL,
    "provider" TEXT NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'pending_configuration',
    "config" JSONB,
    "lastSyncAt" TIMESTAMPTZ(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "retailer_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retailer_feeds" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "merchantAccountId" TEXT,
    "name" TEXT NOT NULL,
    "format" "FeedFormat" NOT NULL DEFAULT 'csv',
    "url" TEXT,
    "fileKey" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "rowsTotal" INTEGER,
    "rowsAccepted" INTEGER,
    "rowsRejected" INTEGER,
    "errors" JSONB,
    "uploadedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "retailer_feeds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "offers" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "retailerSku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "affiliateUrl" TEXT,
    "condition" "ProductCondition" NOT NULL DEFAULT 'new',
    "priceCents" INTEGER NOT NULL,
    "listPriceCents" INTEGER,
    "shippingCents" INTEGER,
    "shippingDaysMin" INTEGER,
    "shippingDaysMax" INTEGER,
    "pickupAvailable" BOOLEAN NOT NULL DEFAULT false,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "stock" "StockStatus" NOT NULL DEFAULT 'unknown',
    "couponCode" TEXT,
    "couponDescription" TEXT,
    "source" "DataSource" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "feedId" TEXT,
    "merchantAccountId" TEXT,
    "firstSeenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastCheckedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChangedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_history" (
    "offerId" TEXT NOT NULL,
    "observedAt" TIMESTAMPTZ(3) NOT NULL,
    "productId" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "shippingCents" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "stock" "StockStatus" NOT NULL DEFAULT 'unknown',
    "source" "DataSource" NOT NULL,

    CONSTRAINT "price_history_pkey" PRIMARY KEY ("offerId","observedAt")
);

-- CreateTable
CREATE TABLE "price_anomalies" (
    "id" TEXT NOT NULL,
    "kind" "AnomalyKind" NOT NULL,
    "severity" "Severity" NOT NULL DEFAULT 'medium',
    "offerId" TEXT,
    "productId" TEXT,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "detectedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "price_anomalies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_matches" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT NOT NULL,
    "offerId" TEXT,
    "productId" TEXT,
    "candidateTitle" TEXT NOT NULL,
    "candidateData" JSONB NOT NULL,
    "confidenceBp" INTEGER NOT NULL,
    "method" "MatchMethod" NOT NULL,
    "status" "MatchStatus" NOT NULL DEFAULT 'pending_review',
    "conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "product_matches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_reviews" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "decision" "ReviewDecision" NOT NULL,
    "productId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "price_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "type" "AlertType" NOT NULL,
    "targetPriceCents" INTEGER,
    "dropPercentBp" INTEGER,
    "retailerId" TEXT,
    "channels" "NotificationChannel"[] DEFAULT ARRAY['email', 'in_app']::"NotificationChannel"[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMPTZ(3),
    "cooldownUntil" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "price_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "alertId" TEXT,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "url" TEXT,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'in_app',
    "dedupeKey" TEXT,
    "sentAt" TIMESTAMPTZ(3),
    "readAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_lists" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "shareSlug" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shopping_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shopping_list_items" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "note" TEXT,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shopping_list_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_comparisons" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "productIds" TEXT[],
    "shareSlug" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_comparisons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recently_viewed" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recently_viewed_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_programs" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT,
    "network" "AffiliateNetwork" NOT NULL,
    "name" TEXT NOT NULL,
    "externalId" TEXT,
    "commissionRateBp" INTEGER,
    "cookieDays" INTEGER,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'pending_configuration',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "affiliate_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_clicks" (
    "id" TEXT NOT NULL,
    "kind" "ClickKind" NOT NULL DEFAULT 'product',
    "subId" TEXT NOT NULL,
    "offerId" TEXT,
    "productId" TEXT,
    "retailerId" TEXT,
    "travelRefId" TEXT,
    "userId" TEXT,
    "placement" TEXT,
    "targetHost" TEXT NOT NULL,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affiliate_clicks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "affiliate_conversions" (
    "id" TEXT NOT NULL,
    "programId" TEXT,
    "clickId" TEXT,
    "network" "AffiliateNetwork" NOT NULL,
    "externalId" TEXT NOT NULL,
    "orderAmountCents" INTEGER NOT NULL,
    "commissionCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "ConversionStatus" NOT NULL DEFAULT 'pending',
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "raw" JSONB,

    CONSTRAINT "affiliate_conversions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "commissions" (
    "id" TEXT NOT NULL,
    "conversionId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "CommissionStatus" NOT NULL DEFAULT 'pending',
    "reconciledAt" TIMESTAMPTZ(3),
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "commissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cashback_transactions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "conversionId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "CashbackStatus" NOT NULL DEFAULT 'pending',
    "note" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cashback_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "interval" "BillingInterval" NOT NULL,
    "features" JSONB NOT NULL,
    "stripePriceId" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'incomplete',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMPTZ(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsored_campaigns" (
    "id" TEXT NOT NULL,
    "retailerId" TEXT,
    "merchantAccountId" TEXT,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "placement" TEXT NOT NULL,
    "productIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "label" TEXT NOT NULL DEFAULT 'Sponsored',
    "budgetCents" INTEGER NOT NULL,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMPTZ(3),
    "endsAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sponsored_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deals" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "productId" TEXT,
    "offerId" TEXT,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "url" TEXT NOT NULL,
    "priceCents" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "status" "DealStatus" NOT NULL DEFAULT 'pending',
    "voteScore" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_votes" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deal_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deal_comments" (
    "id" TEXT NOT NULL,
    "dealId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "parentId" TEXT,
    "body" TEXT NOT NULL,
    "status" "ModerationStatus" NOT NULL DEFAULT 'visible',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "deal_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_events" (
    "id" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "userId" TEXT,
    "sessionHash" TEXT,
    "resultCount" INTEGER NOT NULL,
    "filters" JSONB,
    "degraded" BOOLEAN NOT NULL DEFAULT false,
    "tookMs" INTEGER,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "diff" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_ingestion_jobs" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "retailerId" TEXT,
    "feedId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'queued',
    "stats" JSONB,
    "error" TEXT,
    "queuedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "finishedAt" TIMESTAMPTZ(3),

    CONSTRAINT "data_ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "integration_errors" (
    "id" TEXT NOT NULL,
    "integrationId" TEXT,
    "retailerId" TEXT,
    "provider" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMPTZ(3),

    CONSTRAINT "integration_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_accounts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "retailerId" TEXT,
    "companyName" TEXT NOT NULL,
    "contactEmail" TEXT NOT NULL,
    "website" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchant_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "merchantAccountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" TEXT[],
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "airports" (
    "iata" CHAR(3) NOT NULL,
    "icao" CHAR(4),
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" CHAR(2) NOT NULL,
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "timezone" TEXT,
    "searchRank" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "airports_pkey" PRIMARY KEY ("iata")
);

-- CreateTable
CREATE TABLE "airlines" (
    "iata" CHAR(2) NOT NULL,
    "icao" CHAR(3),
    "name" TEXT NOT NULL,
    "country" CHAR(2),
    "logoUrl" TEXT,

    CONSTRAINT "airlines_pkey" PRIMARY KEY ("iata")
);

-- CreateTable
CREATE TABLE "flight_searches" (
    "id" TEXT NOT NULL,
    "cacheKey" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "providers" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "flight_searches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "flight_offers" (
    "id" TEXT NOT NULL,
    "searchId" TEXT,
    "provider" TEXT NOT NULL,
    "providerOfferId" TEXT,
    "fromIata" CHAR(3) NOT NULL,
    "toIata" CHAR(3) NOT NULL,
    "departAt" TIMESTAMPTZ(3) NOT NULL,
    "returnAt" TIMESTAMPTZ(3),
    "cabin" "CabinClass" NOT NULL DEFAULT 'economy',
    "adults" INTEGER NOT NULL DEFAULT 1,
    "stops" INTEGER NOT NULL DEFAULT 0,
    "durationMinutes" INTEGER NOT NULL,
    "marketingCarrier" CHAR(2) NOT NULL,
    "totalPriceCents" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "slices" JSONB NOT NULL,
    "deepLink" TEXT,
    "source" "DataSource" NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "flight_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotels" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "starRating" DOUBLE PRECISION,
    "address" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "country" CHAR(2) NOT NULL DEFAULT 'US',
    "lat" DOUBLE PRECISION,
    "lon" DOUBLE PRECISION,
    "description" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "imageUrl" TEXT,
    "checkinTime" TEXT,
    "checkoutTime" TEXT,
    "providerRefs" JSONB,
    "source" "DataSource" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "hotels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotel_rates" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "roomName" TEXT NOT NULL,
    "boardType" "BoardType",
    "refundable" BOOLEAN,
    "checkin" DATE NOT NULL,
    "checkout" DATE NOT NULL,
    "guests" INTEGER NOT NULL DEFAULT 2,
    "rooms" INTEGER NOT NULL DEFAULT 1,
    "nightlyPriceCents" INTEGER NOT NULL,
    "totalPriceCents" INTEGER NOT NULL,
    "taxesAndFeesCents" INTEGER,
    "currency" CHAR(3) NOT NULL DEFAULT 'USD',
    "deepLink" TEXT,
    "source" "DataSource" NOT NULL,
    "fetchedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hotel_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "travel_alerts" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "TravelAlertKind" NOT NULL,
    "fromIata" CHAR(3),
    "toIata" CHAR(3),
    "city" TEXT,
    "departDate" DATE,
    "returnDate" DATE,
    "targetPriceCents" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastTriggeredAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "travel_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_tokenHash_key" ON "user_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "user_sessions_userId_idx" ON "user_sessions"("userId");

-- CreateIndex
CREATE INDEX "user_sessions_expiresAt_idx" ON "user_sessions"("expiresAt");

-- CreateIndex
CREATE INDEX "oauth_accounts_userId_idx" ON "oauth_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "oauth_accounts_provider_providerAccountId_key" ON "oauth_accounts"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "password_reset_tokens_tokenHash_key" ON "password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "password_reset_tokens_userId_idx" ON "password_reset_tokens"("userId");

-- CreateIndex
CREATE INDEX "addresses_userId_idx" ON "addresses"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "categories_path_key" ON "categories"("path");

-- CreateIndex
CREATE INDEX "categories_parentId_sortOrder_idx" ON "categories"("parentId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "brands_slug_key" ON "brands"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "brands_name_key" ON "brands"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_categoryId_status_idx" ON "products"("categoryId", "status");

-- CreateIndex
CREATE INDEX "products_brandId_idx" ON "products"("brandId");

-- CreateIndex
CREATE INDEX "products_brandId_mpn_idx" ON "products"("brandId", "mpn");

-- CreateIndex
CREATE INDEX "products_status_updatedAt_idx" ON "products"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "product_variants_productId_key" ON "product_variants"("productId");

-- CreateIndex
CREATE INDEX "product_variants_familyKey_sortOrder_idx" ON "product_variants"("familyKey", "sortOrder");

-- CreateIndex
CREATE INDEX "product_identifiers_type_value_idx" ON "product_identifiers"("type", "value");

-- CreateIndex
CREATE INDEX "product_identifiers_value_idx" ON "product_identifiers"("value");

-- CreateIndex
CREATE UNIQUE INDEX "product_identifiers_productId_type_value_key" ON "product_identifiers"("productId", "type", "value");

-- CreateIndex
CREATE INDEX "product_attributes_productId_sortOrder_idx" ON "product_attributes"("productId", "sortOrder");

-- CreateIndex
CREATE INDEX "product_attributes_name_value_idx" ON "product_attributes"("name", "value");

-- CreateIndex
CREATE INDEX "product_images_productId_sortOrder_idx" ON "product_images"("productId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "retailers_slug_key" ON "retailers"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "retailers_domain_key" ON "retailers"("domain");

-- CreateIndex
CREATE INDEX "retailers_isActive_idx" ON "retailers"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "retailer_integrations_retailerId_provider_key" ON "retailer_integrations"("retailerId", "provider");

-- CreateIndex
CREATE INDEX "retailer_feeds_retailerId_uploadedAt_idx" ON "retailer_feeds"("retailerId", "uploadedAt");

-- CreateIndex
CREATE INDEX "retailer_feeds_merchantAccountId_idx" ON "retailer_feeds"("merchantAccountId");

-- CreateIndex
CREATE INDEX "offers_productId_isActive_priceCents_idx" ON "offers"("productId", "isActive", "priceCents");

-- CreateIndex
CREATE INDEX "offers_retailerId_isActive_idx" ON "offers"("retailerId", "isActive");

-- CreateIndex
CREATE INDEX "offers_source_idx" ON "offers"("source");

-- CreateIndex
CREATE INDEX "offers_lastCheckedAt_idx" ON "offers"("lastCheckedAt");

-- CreateIndex
CREATE UNIQUE INDEX "offers_retailerId_retailerSku_key" ON "offers"("retailerId", "retailerSku");

-- CreateIndex
CREATE INDEX "price_history_productId_observedAt_idx" ON "price_history"("productId", "observedAt");

-- CreateIndex
CREATE INDEX "price_history_retailerId_observedAt_idx" ON "price_history"("retailerId", "observedAt");

-- CreateIndex
CREATE INDEX "price_anomalies_resolvedAt_detectedAt_idx" ON "price_anomalies"("resolvedAt", "detectedAt");

-- CreateIndex
CREATE INDEX "product_matches_status_createdAt_idx" ON "product_matches"("status", "createdAt");

-- CreateIndex
CREATE INDEX "product_matches_productId_idx" ON "product_matches"("productId");

-- CreateIndex
CREATE INDEX "match_reviews_matchId_idx" ON "match_reviews"("matchId");

-- CreateIndex
CREATE INDEX "price_alerts_userId_idx" ON "price_alerts"("userId");

-- CreateIndex
CREATE INDEX "price_alerts_productId_active_idx" ON "price_alerts"("productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupeKey_key" ON "notifications"("dedupeKey");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "favorites_userId_productId_key" ON "favorites"("userId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_lists_shareSlug_key" ON "shopping_lists"("shareSlug");

-- CreateIndex
CREATE INDEX "shopping_lists_userId_idx" ON "shopping_lists"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "shopping_list_items_listId_productId_key" ON "shopping_list_items"("listId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "product_comparisons_shareSlug_key" ON "product_comparisons"("shareSlug");

-- CreateIndex
CREATE INDEX "product_comparisons_userId_idx" ON "product_comparisons"("userId");

-- CreateIndex
CREATE INDEX "recently_viewed_userId_viewedAt_idx" ON "recently_viewed"("userId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "recently_viewed_userId_productId_key" ON "recently_viewed"("userId", "productId");

-- CreateIndex
CREATE INDEX "affiliate_programs_retailerId_idx" ON "affiliate_programs"("retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_programs_network_externalId_key" ON "affiliate_programs"("network", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_clicks_subId_key" ON "affiliate_clicks"("subId");

-- CreateIndex
CREATE INDEX "affiliate_clicks_createdAt_idx" ON "affiliate_clicks"("createdAt");

-- CreateIndex
CREATE INDEX "affiliate_clicks_retailerId_createdAt_idx" ON "affiliate_clicks"("retailerId", "createdAt");

-- CreateIndex
CREATE INDEX "affiliate_clicks_userId_idx" ON "affiliate_clicks"("userId");

-- CreateIndex
CREATE INDEX "affiliate_conversions_clickId_idx" ON "affiliate_conversions"("clickId");

-- CreateIndex
CREATE INDEX "affiliate_conversions_occurredAt_idx" ON "affiliate_conversions"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "affiliate_conversions_network_externalId_key" ON "affiliate_conversions"("network", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "commissions_conversionId_key" ON "commissions"("conversionId");

-- CreateIndex
CREATE INDEX "commissions_status_idx" ON "commissions"("status");

-- CreateIndex
CREATE INDEX "cashback_transactions_userId_status_idx" ON "cashback_transactions"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_code_key" ON "subscription_plans"("code");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_stripePriceId_key" ON "subscription_plans"("stripePriceId");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_stripeSubscriptionId_key" ON "subscriptions"("stripeSubscriptionId");

-- CreateIndex
CREATE INDEX "subscriptions_userId_status_idx" ON "subscriptions"("userId", "status");

-- CreateIndex
CREATE INDEX "sponsored_campaigns_status_placement_idx" ON "sponsored_campaigns"("status", "placement");

-- CreateIndex
CREATE INDEX "deals_status_createdAt_idx" ON "deals"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deal_votes_dealId_userId_key" ON "deal_votes"("dealId", "userId");

-- CreateIndex
CREATE INDEX "deal_comments_dealId_createdAt_idx" ON "deal_comments"("dealId", "createdAt");

-- CreateIndex
CREATE INDEX "search_events_createdAt_idx" ON "search_events"("createdAt");

-- CreateIndex
CREATE INDEX "search_events_normalizedQuery_createdAt_idx" ON "search_events"("normalizedQuery", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "data_ingestion_jobs_status_queuedAt_idx" ON "data_ingestion_jobs"("status", "queuedAt");

-- CreateIndex
CREATE INDEX "data_ingestion_jobs_retailerId_queuedAt_idx" ON "data_ingestion_jobs"("retailerId", "queuedAt");

-- CreateIndex
CREATE INDEX "integration_errors_provider_occurredAt_idx" ON "integration_errors"("provider", "occurredAt");

-- CreateIndex
CREATE INDEX "integration_errors_resolvedAt_idx" ON "integration_errors"("resolvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_accounts_userId_key" ON "merchant_accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_accounts_retailerId_key" ON "merchant_accounts"("retailerId");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_keyHash_key" ON "api_keys"("keyHash");

-- CreateIndex
CREATE INDEX "api_keys_merchantAccountId_idx" ON "api_keys"("merchantAccountId");

-- CreateIndex
CREATE INDEX "airports_city_idx" ON "airports"("city");

-- CreateIndex
CREATE INDEX "airports_country_searchRank_idx" ON "airports"("country", "searchRank");

-- CreateIndex
CREATE UNIQUE INDEX "flight_searches_cacheKey_key" ON "flight_searches"("cacheKey");

-- CreateIndex
CREATE INDEX "flight_searches_expiresAt_idx" ON "flight_searches"("expiresAt");

-- CreateIndex
CREATE INDEX "flight_offers_fromIata_toIata_departAt_idx" ON "flight_offers"("fromIata", "toIata", "departAt");

-- CreateIndex
CREATE INDEX "flight_offers_searchId_idx" ON "flight_offers"("searchId");

-- CreateIndex
CREATE UNIQUE INDEX "hotels_slug_key" ON "hotels"("slug");

-- CreateIndex
CREATE INDEX "hotels_city_idx" ON "hotels"("city");

-- CreateIndex
CREATE INDEX "hotel_rates_hotelId_checkin_idx" ON "hotel_rates"("hotelId", "checkin");

-- CreateIndex
CREATE INDEX "travel_alerts_userId_idx" ON "travel_alerts"("userId");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "oauth_accounts" ADD CONSTRAINT "oauth_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "password_reset_tokens" ADD CONSTRAINT "password_reset_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "brands"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_identifiers" ADD CONSTRAINT "product_identifiers_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_attributes" ADD CONSTRAINT "product_attributes_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_integrations" ADD CONSTRAINT "retailer_integrations_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_feeds" ADD CONSTRAINT "retailer_feeds_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retailer_feeds" ADD CONSTRAINT "retailer_feeds_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "retailer_feeds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "offers" ADD CONSTRAINT "offers_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_anomalies" ADD CONSTRAINT "price_anomalies_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_anomalies" ADD CONSTRAINT "price_anomalies_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_matches" ADD CONSTRAINT "product_matches_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_reviews" ADD CONSTRAINT "match_reviews_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "product_matches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_reviews" ADD CONSTRAINT "match_reviews_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "price_alerts" ADD CONSTRAINT "price_alerts_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_alertId_fkey" FOREIGN KEY ("alertId") REFERENCES "price_alerts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_listId_fkey" FOREIGN KEY ("listId") REFERENCES "shopping_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_comparisons" ADD CONSTRAINT "product_comparisons_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recently_viewed" ADD CONSTRAINT "recently_viewed_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_programs" ADD CONSTRAINT "affiliate_programs_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_clicks" ADD CONSTRAINT "affiliate_clicks_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "affiliate_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affiliate_conversions" ADD CONSTRAINT "affiliate_conversions_clickId_fkey" FOREIGN KEY ("clickId") REFERENCES "affiliate_clicks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commissions" ADD CONSTRAINT "commissions_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "affiliate_conversions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_transactions" ADD CONSTRAINT "cashback_transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cashback_transactions" ADD CONSTRAINT "cashback_transactions_conversionId_fkey" FOREIGN KEY ("conversionId") REFERENCES "affiliate_conversions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsored_campaigns" ADD CONSTRAINT "sponsored_campaigns_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "offers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_votes" ADD CONSTRAINT "deal_votes_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_votes" ADD CONSTRAINT "deal_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_comments" ADD CONSTRAINT "deal_comments_dealId_fkey" FOREIGN KEY ("dealId") REFERENCES "deals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_comments" ADD CONSTRAINT "deal_comments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_comments" ADD CONSTRAINT "deal_comments_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "deal_comments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_events" ADD CONSTRAINT "search_events_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_ingestion_jobs" ADD CONSTRAINT "data_ingestion_jobs_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_ingestion_jobs" ADD CONSTRAINT "data_ingestion_jobs_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "retailer_feeds"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_errors" ADD CONSTRAINT "integration_errors_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "retailer_integrations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "integration_errors" ADD CONSTRAINT "integration_errors_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "merchant_accounts" ADD CONSTRAINT "merchant_accounts_retailerId_fkey" FOREIGN KEY ("retailerId") REFERENCES "retailers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_merchantAccountId_fkey" FOREIGN KEY ("merchantAccountId") REFERENCES "merchant_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "flight_offers" ADD CONSTRAINT "flight_offers_searchId_fkey" FOREIGN KEY ("searchId") REFERENCES "flight_searches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotel_rates" ADD CONSTRAINT "hotel_rates_hotelId_fkey" FOREIGN KEY ("hotelId") REFERENCES "hotels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "travel_alerts" ADD CONSTRAINT "travel_alerts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
