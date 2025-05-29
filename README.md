# Sales Management System with Supabase

## Overview

A simple sales management system built with Supabase as the backend database. This system allows users to:
- Manage product inventory
- Record sales transactions
- Provide analysis (profit, most profitable product,...)

The application uses Supabase for authentication, data storage, and real-time updates.

## Prerequisites

Before you begin, ensure you have the following installed:
- Node.js (v16 or higher)
- npm or yarn
- Git
- A Supabase account (free tier available)

## Quick Start

### 1. Clone the Repository

```bash
git clone [your-repository-url]
cd sales-management-system

```sh
# Step 1: Clone the repository using the project's Git URL.
git clone https://github.com/Paulin-NIYOBYOSE/ISTECH-Sales-Management-Dashboard-V2.git

# Step 2: Navigate to the project directory.
cd ISTECH-Sales-Management-Dashboard-V2

# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev


##Superbase configuration

1. **Create your own Supabase project** at [supabase.com](https://supabase.com)
2. **Replace the credentials** in `src/integrations/supabase/client.ts`:
   ```typescript
   const SUPABASE_URL = "YOUR_NEW_URL";
   const SUPABASE_PUBLIC_KEY = "YOUR_NEW_ANON_KEY";