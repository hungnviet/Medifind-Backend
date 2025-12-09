# MediFind Backend API

Express.js REST API server for MediFind medical information application.

## Project Structure

```
Medifind-Backend/
├── config/          # Configuration files
│   └── database.js  # MongoDB connection setup
├── controllers/     # Route handlers (business logic)
│   ├── authController.js      # User authentication (signup, signin)
│   ├── chatbotController.js   # AI chatbot integration
│   ├── drugController.js      # Medicine search
│   ├── historyController.js   # User history management
│   ├── reminderController.js  # Medication reminders
│   └── scanController.js      # OCR image scanning
├── middleware/      # Express middleware
│   ├── asyncHandler.js  # Async error handling wrapper
│   └── validation.js    # Input validation rules
├── models/          # Mongoose schemas
│   ├── reminder.js  # Reminder schema
│   └── user.js      # User schema
├── routes/          # Route definitions
│   ├── authRoutes.js
│   ├── chatbotRoutes.js
│   ├── drugRoutes.js
│   ├── historyRoutes.js
│   ├── reminderRoutes.js
│   └── scanRoutes.js
├── utils/           # Utility functions
│   └── drugDataTransformer.js  # Drug data formatting
├── app.js           # Main application entry point
├── vie.json         # Vietnamese medicine database (59MB)
└── .env             # Environment variables (not committed)
```

## Setup

### Prerequisites
- Node.js (v14 or higher)
- MongoDB Atlas account
- OpenAI API key
- Azure OCR service endpoint

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file based on `.env.example`:
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```
PORT=3000
NODE_ENV=development
MONGODB_URI=your_mongodb_connection_string
OPENAI_API_KEY=your_openai_api_key
OCR_API_URL=your_ocr_service_url
```

### Running the Server

```bash
node app.js
```

Server will start on port 3000 (or the PORT specified in `.env`).

## API Endpoints

All endpoints are prefixed with `/api/v1`

### Health Check
- `GET /health` - Server health status

### Authentication
- `POST /api/v1/signup` - Register new user
- `POST /api/v1/signin` - User login

### Medicine Search
- `GET /api/v1/drug/:name` - Search medicine by name

### AI Chatbot
- `GET /api/v1/chatBot` - Get AI response to medical questions

### Image Scanning (OCR)
- `POST /api/v1/nlp` - Upload medicine image for OCR processing

### Medication Reminders
- `POST /api/v1/reminder/:id` - Create reminder for user
- `GET /api/v1/reminder/:id` - Get user's reminders
- `PUT /api/v1/reminder/:reminderID/:userID` - Toggle reminder state

### User History
- `POST /api/v1/historySearch/:id` - Add to search history
- `GET /api/v1/historySearch/:id` - Get search history
- `POST /api/v1/historyMedicine/:id` - Add to medicine history
- `GET /api/v1/historyMedicine/:id` - Get medicine history

## Security Features

- Password hashing with bcrypt
- Environment variable configuration
- CORS enabled
- Input validation with express-validator
- MongoDB injection protection

## Dependencies

### Core
- express - Web framework
- mongoose - MongoDB ODM
- dotenv - Environment configuration
- bcrypt - Password hashing
- cors - Cross-origin resource sharing

### Utilities
- multer - File upload handling
- node-fetch - HTTP requests
- form-data - Multipart form data
- express-validator - Request validation

## Notes

- The `vie.json` file contains a large Vietnamese medicine database (59MB)
- Password hashing is implemented - existing plain-text passwords need migration
- All API responses follow a consistent format with `status` field
