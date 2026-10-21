<!DOCTYPE html>
<html lang="$Locale.RFC1766">
<head>
    <% base_tag %>
    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>$Title</title>
    <script type="importmap"{$NonceAttribute}>$ImportMap.RAW</script>
    <% loop $ModulePreloads %>
    <link rel="modulepreload"{$Top.NonceAttribute} href="$URL.ATT" />
    <% end_loop %>
    <script type="application/json" id="ss-admin-modules">$ModuleList.RAW</script>
    <script type="application/json" id="ss-admin-config">$ClientConfig.RAW</script>
    <% if $ScriptURL %>
    <script type="module"{$NonceAttribute} src="$ScriptURL.ATT"></script>
    <% end_if %>
</head>
<body>
</body>
</html>
