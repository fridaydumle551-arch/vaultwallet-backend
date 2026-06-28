# VaultWallet Backend API

Cross-network payment backend for VaultWallet. Built with Node.js, Express, MongoDB, and Socket.io.

## Features

- JWT authentication (signup/login)
- bcrypt password & PIN hashing
- MongoDB database with Mongoose ODM
- Atomic transactions (send/topup with session rollback)
- Real-time balance updates via Socket.io
- Rate limiting on all endpoints
- Input validation with express-validator
- Cross-origin support (CORS)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and add your MongoDB URI and JWT secret:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/vaultwallet
JWT_SECRET=your-super-secret-key-here
PORT=5000
NODE_ENV=development
CORS_ORIGIN=*
```

Get a free MongoDB database at [mongodb.com/atlas](https://mongodb.com/atlas)

### 3. Run the Server

Development (with auto-reload):
```bash
npm run dev
```

Production:
```bash
npm start
```

### 4. Test the API

Open your browser or Postman and visit:
```
http://localhost:5000/api/health
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/signup` | Create account |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/verify` | Verify JWT token |

### User
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/user/profile` | Get profile |
| PUT | `/api/user/update` | Update profile |
| PUT | `/api/user/change-pin` | Change PIN |
| GET | `/api/user/balance` | Get balance |
| GET | `/api/users/search?q=john` | Search users |
| GET | `/api/users/exists/:username` | Check if user exists |

### Transactions
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/transaction/topup` | Add funds |
| POST | `/api/transaction/send` | Send money |
| GET | `/api/transaction/history` | Transaction history |
| GET | `/api/transaction/recent` | Recent transactions |

## Socket.io Events

### Client → Server
| Event | Data | Description |
|-------|------|-------------|
| `join` | `userId` | Join user room for updates |

### Server → Client
| Event | Data | Description |
|-------|------|-------------|
| `balance:update` | `{ balance, currency }` | Balance changed |
| `transaction:new` | `{ type, amount, from/to, note }` | New transaction |

## Deployment

### Render (Recommended - Free)
1. Push code to GitHub
2. Connect repo at [render.com](https://render.com)
3. Add environment variables
4. Deploy

### Railway (Free)
1. Push code to GitHub
2. Import project at [railway.app](https://railway.app)
3. Add MongoDB plugin or external URI
4. Deploy

## Security

- Passwords hashed with bcrypt (12 salt rounds)
- PINs hashed separately with bcrypt
- JWT tokens expire in 7 days
- Rate limiting prevents brute force
- MongoDB transactions ensure atomic transfers
- CORS restricted in production

## License

MIT