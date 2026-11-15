import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DEVELOPMENT_USERS, JWT_EXPIRES_IN } from './auth.constants';
import { LoginDto } from './dto/login.dto';
import { Principal } from './auth.types';

@Injectable()
export class AuthService {
  constructor(private readonly jwtService: JwtService) {}

  async login(dto: LoginDto) {
    const user = DEVELOPMENT_USERS.find(
      (candidate) =>
        candidate.username === dto.username && candidate.password === dto.password,
    );

    if (!user) {
      throw new UnauthorizedException('Invalid username or password.');
    }

    const accessToken = await this.jwtService.signAsync({
      sub: user.principalId,
      username: user.username,
    });

    return {
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: JWT_EXPIRES_IN,
    };
  }

  async verifyToken(token: string): Promise<Principal> {
    const payload = await this.jwtService.verifyAsync<{
      sub: string;
      username: string;
    }>(token);

    if (!payload.sub || !payload.username) {
      throw new UnauthorizedException('Invalid token.');
    }

    return { principalId: payload.sub, username: payload.username };
  }
}
