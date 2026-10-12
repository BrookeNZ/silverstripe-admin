<?php

namespace SilverStripe\Admin\Tests\UserInterface;

use SilverStripe\Admin\LeftAndMain;
use SilverStripe\Control\HTTPResponse;
use SilverStripe\Core\Config\Config;

/**
 * Reading the shell's JSON answers: the success body, a FormSchema state value, and the error envelope
 * (ShellSubmission::jsonError())
 */
trait ShellResponseAssertions
{
    /**
     * The headers of a shell form submission
     */
    protected const SHELL_HEADERS = [
        'X-Requested-With' => 'XMLHttpRequest',
        'Accept' => 'application/json',
        'X-Formschema-Request' => 'state,errors',
    ];

    protected function setUpShell(): void
    {
        Config::modify()->set(LeftAndMain::class, 'piral_shell', true);
    }

    protected function jsonBody(HTTPResponse $response, int $status): array
    {
        $this->assertSame($status, $response->getStatusCode(), $response->getBody());
        $this->assertStringContainsString('application/json', (string) $response->getHeader('Content-Type'));
        return json_decode($response->getBody(), true) ?? [];
    }

    protected function stateValue(array $schema, string $name): mixed
    {
        foreach ($schema['state']['fields'] as $field) {
            if ($field['name'] === $name) {
                return $field['value'];
            }
        }
        $this->fail("No state for $name");
    }

    protected function assertJsonError(HTTPResponse $response, int $code, ?string $reason = null): void
    {
        $this->assertSame($code, $response->getStatusCode(), $response->getBody());
        $this->assertStringContainsString('application/json', (string) $response->getHeader('Content-Type'));
        $body = json_decode($response->getBody(), true);
        $this->assertSame('error', $body['status']);
        $this->assertSame($code, $body['errors'][0]['code']);
        if ($reason !== null) {
            $this->assertSame($reason, $body['errors'][0]['reason']);
        }
    }

    protected function errorMessage(HTTPResponse $response): string
    {
        $this->assertJsonError($response, $response->getStatusCode());
        return json_decode($response->getBody(), true)['errors'][0]['value'];
    }

    protected function errorReason(HTTPResponse $response): ?string
    {
        return json_decode($response->getBody(), true)['errors'][0]['reason'] ?? null;
    }
}
