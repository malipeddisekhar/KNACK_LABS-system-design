# TICKET-04: POST /api/v1/auth/register & login — User Authentication & JWT Session

## 1. Title
`TICKET-04: POST /api/v1/auth/register & login — User Authentication & JWT Session [AI-READY]`

## 2. Context (Why)
Slice 1 used a hardcoded anonymous user identifier. To support Slice 2's personalized user experience and "My Bookings" history, we must allow real students to register, securely hash passwords, and establish authenticated sessions via secure HTTP-only cookies.

## 3. Scope (What)
- Implement `POST /api/v1/auth/register` and `POST /api/v1/auth/login` in `src/auth/auth.controller.ts`.
- Hash passwords using `bcrypt` (10 salt rounds).
- Issue standard signed JWT token containing `{ sub: user.id, email: user.email, role: 'CLIENT' }`.
- Set JWT as a secure, `HttpOnly`, `SameSite=Lax` cookie named `auth_token` on successful login and registration.
- Provide a `JwtAuthGuard` protecting authenticated endpoints.

## 4. Interface Contract (Inputs / Outputs / Data Shapes)
### Register Endpoint:
- **Path:** `POST /api/v1/auth/register`
- **Request Body:**
```json
{
  "email": "student@example.com",
  "password": "Password123!",
  "fullName": "Jane Doe"
}
```
- **Validation Constraints:**
  - `email`: valid email format.
  - `password`: min 8 chars, must contain letters and numbers.
  - `fullName`: string, min 2, max 100 chars.
- **Success Response (201 Created):**
```json
{
  "user": {
    "id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
    "email": "student@example.com",
    "fullName": "Jane Doe",
    "role": "CLIENT"
  }
}
```
- **Response Headers:** `Set-Cookie: auth_token=jwt.token.here; HttpOnly; Path=/; SameSite=Lax`

### Login Endpoint:
- **Path:** `POST /api/v1/auth/login`
- **Request Body:**
```json
{
  "email": "student@example.com",
  "password": "Password123!"
}
```
- **Success Response (200 OK):**
```json
{
  "user": {
    "id": "d3eebc99-9c0b-4ef8-bb6d-6bb9bd380a44",
    "email": "student@example.com",
    "fullName": "Jane Doe",
    "role": "CLIENT"
  }
}
```
- **Error Responses:**
  - `400 Bad Request`: Malformed email or short password.
  - `401 Unauthorized`: Invalid password or non-existent email (`{ "statusCode": 401, "message": "Invalid email or password" }`).
  - `409 Conflict`: Email already registered (`{ "statusCode": 409, "message": "Email is already in use" }`).

## 5. Acceptance Criteria (Given / When / Then)
- **Scenario 1: User Registration**
  - **Given** an unregistered email address,
  - **When** client posts valid credentials to `/api/v1/auth/register`,
  - **Then** status is `201 Created`, user record is persisted with a bcrypt hash (password never stored in plain text), and `Set-Cookie: auth_token` is present in headers.
- **Scenario 2: Duplicate Email Protection**
  - **Given** `student@example.com` already exists in the database,
  - **When** a registration request is sent with that email,
  - **Then** status is `409 Conflict` with message `"Email is already in use"`.
- **Scenario 3: Successful Login**
  - **Given** a registered user,
  - **When** client sends matching email and password to `/api/v1/auth/login`,
  - **Then** status is `200 OK`, user object is returned, and valid `auth_token` cookie is set.
- **Scenario 4: Invalid Password**
  - **Given** a registered user,
  - **When** client sends an incorrect password,
  - **Then** status is `401 Unauthorized` with generic message `"Invalid email or password"`.

## 6. Constraints
- Passwords must be hashed with bcrypt; never log or return passwords.
- JWT expiry set to 7 days (`7d`).
- Secrets read from environment variable `JWT_SECRET`.

## 7. Anti-Scope
- No OAuth (Google/GitHub/Apple) providers.
- No email confirmation links or verification tokens.
- No password reset / "forgot password" flow.
- No provider-specific role onboarding (strictly `CLIENT`).
