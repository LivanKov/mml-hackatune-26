> Note for HACKATUNE participants: the challenge catalog is already uploaded and
> indexed in Cyanite, so you do not upload tracks or handle webhooks. Resolve a
> track via the provided Jamendo to Cyanite ID lookup, then use search and the
> model-outputs endpoint. The upload and webhook sections below are kept for
> reference. See the repo README for the hackathon flow.

# Quick Start

This quick start will get you quickly set up with the Cyanite REST API. We will
go through the process of uploading content to Cyanite, waiting for the tagging
to be ready, and then retrieving the tagging.

The Cyanite REST API analysis flow is asynchronous, meaning that there's a gap
in time between uploading your music and the completion of the tagging. We use a
[Webhook][webhook-reference] to notify you when a tagging is completed for a
track.

We'll cover how to

- Upload a file to the Cyanite API with your API key in place
- Implement a Webhook handler to receive the notification of the tagging
  becoming available
- Make an API call to retrieve the tagging.

## Preparation

To use the Cyanite REST API, you will need an API key. Please
[contact us](https://cyanite.ai/#contact) to request access if you have not
already received your credentials.

To progress through this tutorial, you will need an MP3 file to upload. If you
don't have a file handy, have a look through Wikimedia Commons for a track you
like. Make sure that it's an MP3 - you can use [ffmpeg], among other tools, to
convert to mp3.

We use a [Webhook][webhook-reference] to notify you that your tagging is
available. Please provide your Webhook URL when requesting API access, and we
will configure it for your account. We will also provide you with a Webhook
Secret, which you can use to verify the authenticity of any requests to your
Webhook endpoint.

### Choosing a Webhook URL

In a fully synchronous REST API, the customer makes requests to the server for
data and state modifications over HTTP. In an asynchronous API, some workflows
involve having the server make an HTTP request to the customer.

A Webhook is an endpoint that _you_ implement so that Cyanite can call _you_. In
practice, this means that you will implement an API endpoint accessible on the
public internet, and configure Cyanite to make a call to this URL when certain
events happen within our systems (the completion or failure of music file
processing).

We'll cover how you can use the Webhook Secret to verify that a request to your
endpoint came from Cyanite.

When you're implementing your integration, you'll need a URL accessible via the
public internet that Cyanite can call. In development, you can achieve this in
several ways:

- You can use a cloud tunnel service to expose your locally running webserver to
  the public internet. You will need to make sure that the URL remains stable.
  If your URL changes, Cyanite will need to update the configured webhook url.
- Use a webhook management service such as [webhook.site](https://webhook.site)
  to receive and forward notifications
- You can write your code directly on a machine that's exposed to the public
  internet via the various tools available (editing over SSH, FTP file upload,
  in-browser code editor from your service provider, etc.)

While cloud tunnel or webhook management services are useful in
development, we do not recommend their use in a production environment. Instead,
you should use typical web hosting of your application/handler.

## Step 1: Upload your track to Cyanite

In order for Cyanite to analyze and tag your track, you will need to
[upload it via our API](/reference/api/post-library-track).

Don't _run_ this code just yet - we'll need to complete the next step before we
can retrieve the results.

If your integration involves first uploading content to your own system
via HTTP, make sure that your max upload size is configured appropriately.

Cyanite supports audio files that meet all of the following criteria:

- Up to 20mb in size
- Up to 15 minutes in total length


<Tabs groupId="programming-language">
  <TabItem value="ts" label="Typescript" default>
    We'll use Typescript to send a request to the API using fetch.

    First, set your API key in your `.env` file for easy access throughout your
    application:

    ```bash
    CYANITE_API_KEY=your_api_key_here
    ```

    Replace `your_api_key_here` with the API key you were provided with.

    Now let's use fetch to send the request to the API.

    ```typescript

    const fileData = await readFile("/path/to/your/track.mp3");
    const file = new File([fileData], "track.mp3", { type: "audio/mpeg" });

    const formData = new FormData();
    formData.append("title", "your_track_name");
    formData.append("inputType", "MP3");
    formData.append("file", file);

    const response = await fetch(`https://rest-api.cyanite.ai/v1/library-tracks`, {
      method: "POST",
      headers: {
        "x-api-key": process.env.CYANITE_API_KEY,
      },
      body: formData,
    });

    const result = await response.json();
    ```

  </TabItem>
  <TabItem value="php" label="PHP">
    We'll use PHP to send a request to the API, using Laravel's built-in HTTP
    client. This client is available out of the box in Laravel applications
    (version 7.x and above).

    Any other HTTP client you prefer will work just fine.

    First, set your API key in your `.env` file for easy access throughout your
    application:

    ```bash
    CYANITE_API_KEY=your_api_key_here
    ```

    Replace `your_api_key_here` with the API key you were provided with.

    Now, let's construct the PHP code to send a request to the API. You can
    place this code in a controller or a route closure:

    ```php
    <?php
    use Illuminate\Support\Facades\Http;

    $response = Http::withHeaders([
        'x-api-key' => env('CYANITE_API_KEY'),
    ])->attach(
        'file', fopen('/path/to/your/track.mp3', 'r'), 'track.mp3'
    ])->post('https://rest-api.cyanite.ai/v1/library-tracks', [
        'title' => 'your_track_name',
        'inputType' => 'MP3',
    ]);

    // Handle the response
    $data = $response->json();
    ```

  </TabItem>
  <TabItem value="python" label="Python">
    Set your API key in your environment variables for easy access
    throughout your application:

    ```bash
    export CYANITE_API_KEY=your_api_key_here
    ```

    Replace `your_api_key_here` with the API key you were provided with.

    Now, let's construct the Python code to send a request to the API. You can
    place this code in your application wherever you need to upload a track:

    ```python
    import json
    import os
    import urllib.request
    import uuid

    api_key = os.environ.get("CYANITE_API_KEY")

    # Create multipart form data
    boundary = str(uuid.uuid4())

    with open("/path/to/your/track.mp3", "rb") as f:
        file_data = f.read()

    # Build multipart body manually
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="title"\r\n\r\n'
        f"your_track_name\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="inputType"\r\n\r\n'
        f"MP3\r\n"
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="track.mp3"\r\n'
        f"Content-Type: audio/mpeg\r\n\r\n"
    ).encode("utf-8") + file_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        "https://rest-api.cyanite.ai/v1/library-tracks",
        data=body,
        headers={
            "x-api-key": api_key,
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST",
    )

    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read().decode("utf-8"))
    ```

  </TabItem>
</Tabs>

### Step 2: Receiving the results

After you send the request, the API will start processing your track. When the
analysis is complete and the tagging is available, you will receive a
notification over your configured Webhook endpoint. At that point, you will be
able to [retrieve the model outputs](/reference/api/get-models-by-track-id) for
the uploaded track.

#### Webhook Payload Structure

The webhook request body is a JSON object with the following structure:

```json
{
  "type": "analysisJob/finished",
  "timestamp": "2022-11-03T20:26:10.344522Z",
  "data": {
    "track": {
      "id": "libtr_01KFZQGZ6FJAK5C320"
    }
  }
}
```

| Field           | Type   | Description                                                     |
| --------------- | ------ | --------------------------------------------------------------- |
| `type`          | string | The event type (`analysisJob/finished` or `analysisJob/failed`) |
| `timestamp`     | string | An ISO8601 formatted timestamp of when the event occurred       |
| `data.track.id` | string | The Cyanite track ID that was analyzed                          |

#### Webhook Event Types

Cyanite will send one of two webhook events to your endpoint:

| Event Type             | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `analysisJob/finished` | The analysis completed successfully and tagging is available |
| `analysisJob/failed`   | The analysis failed to complete                              |

#### Webhook Headers

Each webhook request includes the following headers that you should use for
verification and tracking:

| Header              | Description                                                                                        |
| ------------------- | -------------------------------------------------------------------------------------------------- |
| `webhook-id`        | A unique identifier for this specific notification                                                 |
| `webhook-timestamp` | Unix timestamp (seconds since epoch) of when the webhook notification was issued                   |
| `webhook-signature` | An HMAC signature of the webhook request. Use this with your webhook secret to verify authenticity |

#### Verifying Webhook Signatures

Cyanite follows the [Standard Webhooks](https://www.standardwebhooks.com)
specification for webhook signatures. Verifying signatures ensures that webhook
requests genuinely originate from Cyanite and haven't been tampered with. The
Standard Webhooks specification provides implementation for different languages
(python, php, rust, etc.).

When you receive your webhook secret from Cyanite, it is already
**base64-encoded** (e.g., `MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw`). The Standard
Webhooks library expects the secret to include a `whsec_` prefix, so you must
prepend this prefix before using it.

Store the prefixed version in your `CYANITE_WEBHOOK_SECRET` environment
variable:

```bash
export CYANITE_WEBHOOK_SECRET=whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw
```

#### Implementing Your Webhook Handler

Lets see how to implement a webhook handler to receive the notification and
retrieve the tagging results.

This endpoint needs to be accessible via the public internet by Cyanite's
servers. For example, you could deploy it to a server using the domain and
endpoint URL `https://receiver.example.com/webhooks/cyanite-webhook`. This would
then be your webhook URL you provide to Cyanite for configuration.

<Tabs groupId="programming-language">
  <TabItem value="ts" label="typescript" default>
    We'll use the NodeJS http library as well as `standardwebhooks` to validate the webhook's authenticity.

    The http module comes with node, but we'll need to install `standardwebhooks` - use your package manager of choice to install it.

    ```bash
    $ npm install --save standardwebhooks
    ```


    ```typescript
    import { createServer } from 'node:http';
    import { Webhook } from 'standardwebhooks';

    const WEBHOOK_SECRET = process.env.CYANITE_WEBHOOK_SECRET;

    createServer((req, res) => {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        // We always respond 200 if we receive the request - this prevents unnecessary retries
        res.writeHead(200);
        res.end();

        // Get webhook headers
        const headers = {
          'webhook-id': req.headers['webhook-id'] as string,
          'webhook-timestamp': req.headers['webhook-timestamp'] as string,
          'webhook-signature': req.headers['webhook-signature'] as string,
        };

        // Verify the webhook signature using Standard Webhooks library
        try {
          const wh = new Webhook(WEBHOOK_SECRET);
          const payload = wh.verify(body, headers);

          // If the webhook verification fails, it will throw, and the following business logic won't execute

          // Get track ID from webhook payload
          const trackId = payload.data.track.id;

          const music_data_response = await fetch(
            `https://rest-api.cyanite.ai/v1/library-tracks/${trackId}/models?model=TempoV1&model=KeyV2&model=BpmV2`, {
              headers: {
                "x-api-key": process.env.CYANITE_API_KEY,
              }
            }
          );
          const music_data = await music_data_response.json();


        } catch (err) {
          // Handle errors - webhook signature validation errors, or otherwise
        }
      });

    }).listen(PORT || 8080);
    ```

  </TabItem>
  <TabItem value="php" label="PHP">
    First, install the Standard Webhooks library using Composer:

    ```bash
    composer require standard-webhooks/standard-webhooks
    ```

    ```php
    <?php
    use Illuminate\Http\Request;
    use Illuminate\Support\Facades\Http;
    use Illuminate\Support\Facades\Route;
    use StandardWebhooks\Webhook;
    use StandardWebhooks\Exception\WebhookVerificationException;

    Route::post('/cyanite-webhook', function (Request $request) {
        // Your webhook secret with the 'whsec_' prefix (see "Verifying Webhook Signatures" above)
        $webhookSecret = env('CYANITE_WEBHOOK_SECRET');

        // Get raw payload (important: don't parse/modify it)
        $body = $request->getContent();

        // Get webhook headers as an associative array
        $headers = [
            'webhook-id' => $request->header('webhook-id'),
            'webhook-timestamp' => $request->header('webhook-timestamp'),
            'webhook-signature' => $request->header('webhook-signature'),
        ];

        // Verify the webhook signature using Standard Webhooks library
        try {
            $wh = new Webhook($webhookSecret);
            $payload = $wh->verify($body, $headers);
        } catch (WebhookVerificationException $e) {
            // We always return 200 to prevent retries
            return response()->json(['error' => 'Invalid signature'], 200);
        }

        // At this point, we know we've had a valid request from Cyanite, so we
        // can proceed to handle the payload

        // Get track ID from webhook payload
        $trackId = $payload['data']['track']['id'];

        // Retrieve tagging from Cyanite API
        $music_data = Http::withHeaders([
            'x-api-key' => env('CYANITE_API_KEY'),
        ])->get("https://rest-api.cyanite.ai/v1/library-tracks/{$trackId}/models?model=TempoV1&model=KeyV2&model=BpmV2");

        // Use $music_data for your business logic

        // respond with 200 to the webhook to acknowledge receipt
        return response()->json([], 200);
    });
    ```

  </TabItem>
  <TabItem value="python" label="Python">
    First, install the Standard Webhooks library using pip:

    ```bash
    pip install standardwebhooks
    ```

    ```python
    import http.server
    import json
    import os
    import urllib.request

    from standardwebhooks.webhooks import Webhook, WebhookVerificationError

    # Your webhook secret with the 'whsec_' prefix (see "Verifying Webhook Signatures" above)
    CYANITE_WEBHOOK_SECRET = os.getenv("CYANITE_WEBHOOK_SECRET", "")
    CYANITE_API_KEY = os.getenv("CYANITE_API_KEY", "")


    class WebhookHandler(http.server.BaseHTTPRequestHandler):
        def do_POST(self):
            if self.path == "/webhook":
                content_length = int(self.headers.get("Content-Length", 0))
                body = self.rfile.read(content_length).decode("utf-8")

                # Get webhook headers
                headers = {
                    "webhook-id": self.headers.get("webhook-id", ""),
                    "webhook-timestamp": self.headers.get("webhook-timestamp", ""),
                    "webhook-signature": self.headers.get("webhook-signature", ""),
                }

                # Verify the webhook signature using Standard Webhooks library
                try:
                    wh = Webhook(CYANITE_WEBHOOK_SECRET)
                    payload = wh.verify(body, headers)
                except WebhookVerificationError:
                    self.send_response(200)
                    self.end_headers()
                    self.wfile.write(b"Invalid signature")
                    return

                # Get track ID from webhook payload
                track_id = payload.get("data", {}).get("track", {}).get("id")

                # Retrieve music data from Cyanite API
                models_url = f"https://rest-api.cyanite.ai/v1/library-tracks/{track_id}/models?model=TempoV1&model=KeyV2&model=BpmV2"
                req = urllib.request.Request(
                    models_url,
                    headers={"x-api-key": CYANITE_API_KEY},
                )
                with urllib.request.urlopen(req) as response:
                    music_data = json.loads(response.read().decode("utf-8"))
                # Use music_data for your business logic

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({}).encode())
                return


    if __name__ == "__main__":
        port = 8000
        host = "localhost"
        server = http.server.HTTPServer((host, port), WebhookHandler)
        print(f"Webhook server running on port {port}")
        print(f"Endpoint: POST http://localhost:{port}/webhook")
        server.serve_forever()
    ```

  </TabItem>
</Tabs>

If your endpoint does not return a status of 200, Cyanite will retry the
notification. If your endpoint fails several times in a row, your webhook will
be marked as undeliverable to prevent extraneous invalid traffic. If this
happens unexpectedly, please reach out to us and we can help you troubleshoot,
and if necessary reset your webhook subscription.

## Summary

Congratulations! You've made your first track data inference using the Cyanite
API. You should now have a good understanding of the basics of how to use our
API. We keep as much consistent from endpoint to endpoint as possible, so the
understanding you gained here will help you as you explore other endpoints as
well.

### Next steps

- [Model Outputs Guide](./model_outputs.md) - Learn about the different model
  outputs available and how to interpret their data
- [API Reference](/reference/api) - Get into the details of all our API
  endpoints

### Feedback

We'd love to hear your feedback on this quick start guide. If you have any
suggestions for improvements or if you found any issues, please let us know.
Your feedback will help us improve the documentation and make it easier for
others to get started with the Cyanite API.

[webhook-reference]: https://en.wikipedia.org/wiki/Webhook
[ffmpeg]: https://ffmpeg.org/
