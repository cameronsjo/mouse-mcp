# API Clients

This document describes the API clients used to fetch Disney Parks data.

## Client Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DisneyFinderClient                          │
│                         (primary)                                │
│                                                                  │
│  - Rich metadata (Lightning Lane, height requirements)           │
│  - Requires browser-based authentication                         │
│  - Uses SessionManager for cookies                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                        auth failure
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ThemeParksWikiClient                          │
│                        (fallback)                                │
│                                                                  │
│  - Basic entity data                                             │
│  - No authentication required                                    │
│  - Public REST API                                               │
└─────────────────────────────────────────────────────────────────┘
```

## DisneyFinderClient

Primary data source using Disney's official Finder API.

### Source File

`src/clients/disney-finder.ts`

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/finder/api/v1/explorer-service/list/destination/{dest}/type/attraction` | All attractions |
| GET | `/finder/api/v1/explorer-service/list/ancestor/{parkId}/type/attraction` | Park attractions |
| GET | `/finder/api/v1/explorer-service/list/destination/{dest}/type/dining` | All dining |
| GET | `/finder/api/v1/explorer-service/list/ancestor/{parkId}/type/dining` | Park dining |

### Base URLs

```typescript
const API_URLS: Record<DestinationId, string> = {
  wdw: "https://disneyworld.disney.go.com/finder/api/v1/explorer-service",
  dlr: "https://disneyland.disney.go.com/finder/api/v1/explorer-service",
};
```

### Authentication

Requires cookies from browser session:

```typescript
async getAuthHeaders(destination: DestinationId): Promise<Record<string, string>> {
  const session = await this.getSession(destination);

  const cookieHeader = session.cookies
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  return {
    Cookie: cookieHeader,
    Accept: "application/json",
    "Accept-Language": "en-US,en;q=0.9",
  };
}
```

### Methods

#### getDestinations()

Returns hardcoded destination data (no API call needed).

```typescript
async getDestinations(): Promise<DisneyDestination[]>
```

**Returns**: Array of destination objects with parks.

#### getAttractions()

Fetches attractions with optional park filter.

```typescript
async getAttractions(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyAttraction[]>
```

**Parameters**:

- `destinationId`: `"wdw"` or `"dlr"`
- `parkId`: Optional park ID to filter results

**Returns**: Array of normalized attraction objects.

**Caching**: 24-hour TTL with key `attractions:{dest}:{parkId?}`

#### getDining()

Fetches dining locations with optional park filter.

```typescript
async getDining(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyDining[]>
```

**Parameters**:

- `destinationId`: `"wdw"` or `"dlr"`
- `parkId`: Optional park ID to filter results

**Returns**: Array of normalized dining objects.

**Caching**: 24-hour TTL with key `dining:{dest}:{parkId?}`

#### getShows()

Shows are fetched from ThemeParks.wiki (Disney API doesn't expose them well).

```typescript
async getShows(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyShow[]>
```

### Response Normalization

Disney API responses are transformed to internal types:

```typescript
// Raw Disney API response
{
  "id": "80010190",
  "name": "Space Mountain",
  "urlFriendlyId": "space-mountain",
  "ancestorThemeParkId": "80007944",
  "heightRequirement": "44 in",
  "thrillLevel": "Thrill Rides",
  "lightningLane": true,
  "geniePlus": true,
  "singleRider": false,
  "coordinates": { "latitude": 28.419, "longitude": -81.578 }
}

// Normalized output
{
  "id": "80010190",
  "name": "Space Mountain",
  "slug": "space-mountain",
  "entityType": "ATTRACTION",
  "destinationId": "wdw",
  "parkId": "80007944",
  "parkName": "Magic Kingdom Park",
  "location": { "latitude": 28.419, "longitude": -81.578 },
  "heightRequirement": {
    "inches": 44,
    "centimeters": 112,
    "description": "44 in"
  },
  "thrillLevel": "thrill",
  "lightningLane": { "tier": "multi-pass", "available": true },
  "singleRider": false
}
```

### Error Handling

On API failure, automatically falls back to ThemeParks.wiki:

```typescript
try {
  const attractions = await this.fetchAttractionsFromDisney(destinationId, parkId);
  return attractions;
} catch (error) {
  logger.warn("Disney API failed, falling back to ThemeParks.wiki");
  const wikiClient = getThemeParksWikiClient();
  return wikiClient.getAttractions(destinationId, parkId);
}
```

## ThemeParksWikiClient

Fallback data source using the public ThemeParks.wiki API.

### Source File

`src/clients/themeparks-wiki.ts`

### API Documentation

Official docs: [https://api.themeparks.wiki](https://api.themeparks.wiki)

### Base URL

```typescript
const BASE_URL = "https://api.themeparks.wiki/v1";
```

### Destination UUIDs

```typescript
const DESTINATION_UUIDS: Record<DestinationId, string> = {
  wdw: "e957da41-3552-4cf6-b636-5babc5cbc4e5",
  dlr: "bfc89fd6-314d-44b4-b89e-df1a89cf991e",
};
```

### Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/destinations` | All destinations |
| GET | `/entity/{uuid}/children` | All children of entity |
| GET | `/entity/{id}` | Single entity |

### Methods

#### getDestinations()

```typescript
async getDestinations(): Promise<DisneyDestination[]>
```

Fetches `/destinations` and filters to supported Disney properties.

#### getAttractions()

```typescript
async getAttractions(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyAttraction[]>
```

Fetches destination children and filters to `entityType === "ATTRACTION"`.

#### getDining()

```typescript
async getDining(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyDining[]>
```

Fetches destination children and filters to `entityType === "RESTAURANT"`.

#### getShows()

```typescript
async getShows(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyShow[]>
```

Fetches destination children and filters to `entityType === "SHOW"`.

#### getEntityById()

```typescript
async getEntityById(id: string): Promise<DisneyEntity | null>
```

Direct entity lookup by ID.

### Response Format

ThemeParks.wiki returns entities with tags:

```typescript
// Raw response
{
  "id": "3c2a8a3b-8d3d-4c9e-9b3e-3c2a8a3b8d3d",
  "name": "Space Mountain",
  "entityType": "ATTRACTION",
  "parentId": "75ea578a-adc8-4116-a54d-dccb60765ef9",
  "location": { "latitude": 28.419, "longitude": -81.578 },
  "tags": [
    { "key": "heightRequirement", "value": "44 in" },
    { "key": "thrillLevel", "value": "Thrill Rides" },
    { "key": "lightningLane", "value": "true" }
  ]
}
```

### Tag Extraction

Tags are converted to structured fields:

```typescript
private extractTags(
  tags?: Array<{ key: string; value: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  if (tags) {
    for (const tag of tags) {
      map.set(tag.key, tag.value);
    }
  }
  return map;
}
```

## SessionManager

Handles Disney API authentication via Playwright browser automation.

### Source File

`src/clients/session-manager.ts`

### Session Lifecycle

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Check     │────▶│   Launch    │────▶│  Navigate   │
│   Cache     │     │  Playwright │     │   to Site   │
└─────────────┘     └─────────────┘     └─────────────┘
                                              │
┌─────────────┐     ┌─────────────┐     ┌─────▼───────┐
│   Persist   │◀────│   Extract   │◀────│   Handle    │
│   Session   │     │   Cookies   │     │   Consent   │
└─────────────┘     └─────────────┘     └─────────────┘
```

### Configuration

```typescript
const DISNEY_URLS: Record<DestinationId, string> = {
  wdw: "https://disneyworld.disney.go.com",
  dlr: "https://disneyland.disney.go.com",
};

const CONSENT_SELECTORS = [
  "#onetrust-accept-btn-handler",
  '[data-testid="cookie-accept"]',
  'button[aria-label*="Accept"]',
];

const SESSION_DURATION_HOURS = 24;
```

### Methods

#### initialize()

```typescript
async initialize(): Promise<void>
```

Loads persisted sessions and logs status.

#### getSession()

```typescript
async getSession(destination: DestinationId): Promise<DisneySession | null>
```

Returns valid session or triggers refresh.

#### getAuthHeaders()

```typescript
async getAuthHeaders(destination: DestinationId): Promise<Record<string, string>>
```

Builds HTTP headers from session cookies.

#### reportSuccess() / reportError()

```typescript
async reportSuccess(destination: DestinationId): Promise<void>
async reportError(destination: DestinationId, error: Error): Promise<void>
```

Tracks session health for monitoring.

#### shutdown()

```typescript
async shutdown(): Promise<void>
```

Closes Playwright browser gracefully.

### Session Refresh Flow

1. **Check cache**: Load session from SQLite
2. **Validate**: Check expiration with buffer
3. **Deduplicate**: Merge concurrent refresh requests
4. **Launch browser**: Start Playwright Chromium
5. **Create context**: Configure viewport, locale, timezone
6. **Navigate**: Go to Disney homepage
7. **Consent**: Click cookie accept button if present
8. **Wait**: Poll for session cookies (10 attempts, 1s each)
9. **Extract**: Get cookies and localStorage tokens
10. **Calculate expiration**: Use cookie expiry or default 24h
11. **Persist**: Save to SQLite

### Session Data Structure

```typescript
interface DisneySession {
  destination: DestinationId;
  state: "uninitialized" | "active" | "expired" | "error";
  cookies: SessionCookie[];
  tokens: {
    sessionId?: string;    // SWID cookie
    authToken?: string;    // from localStorage
    csrfToken?: string;
  };
  createdAt: string;       // ISO timestamp
  refreshedAt: string;     // ISO timestamp
  expiresAt: string;       // ISO timestamp
  errorCount: number;
  lastError?: string;
}
```

## Retry Logic

Both clients use exponential backoff:

```typescript
async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const { maxRetries = 3, baseDelayMs = 1000, nonRetryableStatusCodes = [] } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (isNonRetryable(error, nonRetryableStatusCodes)) {
        throw error;
      }

      if (attempt === maxRetries) {
        throw error;
      }

      const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
      await sleep(delay);
    }
  }
}
```

**Non-retryable status codes**: 400, 401, 403, 404

## Park Reference Data

Both clients use these park mappings:

### Walt Disney World (wdw)

| Park ID | Name | Slug |
|---------|------|------|
| 80007944 | Magic Kingdom Park | magic-kingdom |
| 80007838 | EPCOT | epcot |
| 80007998 | Disney's Hollywood Studios | hollywood-studios |
| 80007823 | Disney's Animal Kingdom Theme Park | animal-kingdom |

### Disneyland Resort (dlr)

| Park ID | Name | Slug |
|---------|------|------|
| 330339 | Disneyland Park | disneyland |
| 336894 | Disney California Adventure Park | california-adventure |

## Singleton Pattern

All clients use singletons:

```typescript
let instance: DisneyFinderClient | null = null;

export function getDisneyFinderClient(): DisneyFinderClient {
  if (!instance) {
    instance = new DisneyFinderClient();
  }
  return instance;
}
```

This ensures:

- Single Playwright browser instance
- Shared session state
- Connection pooling
