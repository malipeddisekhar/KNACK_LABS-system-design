import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { Principal } from './auth.types';

export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const request = context.switchToHttp().getRequest<{ user?: Principal }>();

    if (!request.user) {
      throw new UnauthorizedException('Authenticated principal is required.');
    }

    return request.user;
  },
);
