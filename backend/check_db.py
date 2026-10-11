from pathlib import Path

import psycopg
from dotenv import dotenv_values

config = dotenv_values(Path(__file__).with_name(".env"))
database_url = config.get("DATABASE_URL")

try:
    with psycopg.connect(
        database_url,
        connect_timeout=10,
        sslmode="require",
    ) as connection:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()

    if result == (1,):
        print("Database connection successful")

except Exception as error:
    message = str(error)

    if database_url:
        message = message.replace(database_url, "[hidden URL]")

        from urllib.parse import unquote, urlsplit

        password = urlsplit(database_url).password
        if password:
            message = message.replace(password, "[hidden password]")
            message = message.replace(
                unquote(password), "[hidden password]"
            )

    print(f"Database connection failed: {type(error).__name__}")
    print(message)
