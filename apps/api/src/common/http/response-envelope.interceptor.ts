import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from "@nestjs/common";
import type { ApiSuccessEnvelope } from "@repomentor/contracts";
import { map, type Observable } from "rxjs";

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessEnvelope<T>> {
    return next.handle().pipe(map((data) => ({ data })));
  }
}
