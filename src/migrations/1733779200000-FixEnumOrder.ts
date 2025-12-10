// src/migrations/1733779200000-FixEnumOrder.ts - UPDATED
import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixEnumOrder1733779200000 implements MigrationInterface {
    name = 'FixEnumOrder1733779200000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // 1. Create ENUM types IF THEY DON'T EXIST
        await queryRunner.query(`
            DO $$ 
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_type_enum') THEN
                    CREATE TYPE "public"."transactions_type_enum" AS ENUM ('DEPOSIT', 'TRANSFER');
                END IF;
                
                IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'transactions_status_enum') THEN
                    CREATE TYPE "public"."transactions_status_enum" AS ENUM ('PENDING', 'SUCCESS', 'FAILED');
                END IF;
            END $$;
        `);

        // 2. Create users table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "users" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "email" character varying NOT NULL,
                "google_id" character varying NOT NULL,
                "display_name" character varying,
                "profile_picture" character varying,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"),
                CONSTRAINT "UQ_9e90ef6dfa6c53e95dc3b6f6a06" UNIQUE ("google_id"),
                CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id")
            )
        `);

        // 3. Create wallets table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "wallets" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "wallet_number" character varying NOT NULL,
                "balance" numeric(10,2) NOT NULL DEFAULT '0',
                "user_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_e6f0b5e4ee3d8a2ac9f8d4e4b4e" UNIQUE ("wallet_number"),
                CONSTRAINT "PK_bec464dd8d54c39c54fd32e2334" PRIMARY KEY ("id")
            )
        `);

        // 4. Create transactions table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "transactions" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "reference" character varying NOT NULL,
                "amount" numeric(10,2) NOT NULL,
                "type" "public"."transactions_type_enum" NOT NULL,
                "status" "public"."transactions_status_enum" NOT NULL DEFAULT 'PENDING',
                "recipient_wallet_number" character varying,
                "wallet_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_4d0f7b8c6e3e3e3e3e3e3e3e3e3" UNIQUE ("reference"),
                CONSTRAINT "PK_a219afd8dd77ed80f5a862f1db9" PRIMARY KEY ("id")
            )
        `);

        // 5. Create api_keys table
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "api_keys" (
                "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
                "name" character varying NOT NULL,
                "key" character varying NOT NULL,
                "permissions" text NOT NULL,
                "is_active" boolean NOT NULL DEFAULT true,
                "expires_at" TIMESTAMP NOT NULL,
                "last_used_at" TIMESTAMP,
                "user_id" uuid NOT NULL,
                "created_at" TIMESTAMP NOT NULL DEFAULT now(),
                "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
                CONSTRAINT "UQ_4d0f7b8c6e3e3e3e3e3e3e3e3e4" UNIQUE ("key"),
                CONSTRAINT "PK_5c8a79801b44bd27b4c1c7c8a79" PRIMARY KEY ("id")
            )
        `);

        // 6. Add foreign key constraints (WITHOUT IF NOT EXISTS - handled differently)
        // Check if constraint exists before adding
        const walletFkExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' 
            AND table_name = 'wallets' 
            AND constraint_name = 'FK_wallets_user_id'
        `);
        
        if (walletFkExists.length === 0) {
            await queryRunner.query(`
                ALTER TABLE "wallets" 
                ADD CONSTRAINT "FK_wallets_user_id" 
                FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
            `);
        }

        const transactionFkExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' 
            AND table_name = 'transactions' 
            AND constraint_name = 'FK_transactions_wallet_id'
        `);
        
        if (transactionFkExists.length === 0) {
            await queryRunner.query(`
                ALTER TABLE "transactions" 
                ADD CONSTRAINT "FK_transactions_wallet_id" 
                FOREIGN KEY ("wallet_id") REFERENCES "wallets"("id") ON DELETE CASCADE;
            `);
        }

        const apiKeyFkExists = await queryRunner.query(`
            SELECT 1 FROM information_schema.table_constraints 
            WHERE constraint_schema = 'public' 
            AND table_name = 'api_keys' 
            AND constraint_name = 'FK_api_keys_user_id'
        `);
        
        if (apiKeyFkExists.length === 0) {
            await queryRunner.query(`
                ALTER TABLE "api_keys" 
                ADD CONSTRAINT "FK_api_keys_user_id" 
                FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
            `);
        }
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop foreign keys if they exist
        await queryRunner.query(`
            DO $$ 
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_schema = 'public' 
                    AND table_name = 'api_keys' 
                    AND constraint_name = 'FK_api_keys_user_id'
                ) THEN
                    ALTER TABLE "api_keys" DROP CONSTRAINT "FK_api_keys_user_id";
                END IF;
                
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_schema = 'public' 
                    AND table_name = 'transactions' 
                    AND constraint_name = 'FK_transactions_wallet_id'
                ) THEN
                    ALTER TABLE "transactions" DROP CONSTRAINT "FK_transactions_wallet_id";
                END IF;
                
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints 
                    WHERE constraint_schema = 'public' 
                    AND table_name = 'wallets' 
                    AND constraint_name = 'FK_wallets_user_id'
                ) THEN
                    ALTER TABLE "wallets" DROP CONSTRAINT "FK_wallets_user_id";
                END IF;
            END $$;
        `);

        await queryRunner.query(`DROP TABLE IF EXISTS "api_keys" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "transactions" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "wallets" CASCADE;`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users" CASCADE;`);

        await queryRunner.query(`DROP TYPE IF EXISTS "public"."transactions_status_enum";`);
        await queryRunner.query(`DROP TYPE IF EXISTS "public"."transactions_type_enum";`);
    }
}