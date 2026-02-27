import json

def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json"
        },
        "body": json.dumps({
            "message": "hello world",
            "method": event.get("httpMethod"),
            "path": event.get("path")
        }, ensure_ascii=False)
    }
