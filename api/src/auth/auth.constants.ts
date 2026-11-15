export const DEVELOPMENT_USERS = [
  {
    username: 'alice',
    password: 'alice-development-password',
    principalId: 'principal-alice',
  },
  {
    username: 'bob',
    password: 'bob-development-password',
    principalId: 'principal-bob',
  },
] as const;

export const JWT_EXPIRES_IN = '15m';
