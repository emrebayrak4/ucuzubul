import { Controller, Get, Inject, Query, Req } from "@nestjs/common";
import type { SearchResponse, SuggestResponse, TrendingResponse } from "@pricora/contracts";
import { Auth, type AuthedRequest } from "../common/auth";
import { input } from "../common/validate";
import { SearchService } from "../services/search.service";

@Controller("search")
export class SearchController {
  constructor(@Inject(SearchService) private readonly search: SearchService) {}

  @Get()
  @Auth("optional")
  run(@Query() query: unknown, @Req() req: AuthedRequest): Promise<SearchResponse> {
    return this.search.search(input("search.search", "query", query), req.user?.id);
  }

  @Get("suggest")
  suggest(@Query() query: unknown): Promise<SuggestResponse> {
    return this.search.suggest(input("search.suggest", "query", query).q);
  }

  @Get("trending")
  trending(): Promise<TrendingResponse> {
    return this.search.trending();
  }
}
