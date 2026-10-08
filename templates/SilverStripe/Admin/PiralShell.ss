<!DOCTYPE html>
<html lang="$Locale.RFC1766">
<head>
    <% base_tag %>
    <meta http-equiv="Content-type" content="text/html; charset=utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>$Title</title>
    <% loop $PiralPreloadLinks %>
    <link rel="preload" href="$URL.ATT" as="$As"<% if $CrossOrigin %> crossorigin="$CrossOrigin"<% end_if %> />
    <% end_loop %>
</head>
<body class="cms cms--piral">
    <div id="ss-admin-shell" data-feed-url="$PiletFeedLink" data-admin-url="$AdminURL" data-menu="$PiralMenu.ATT" data-top-bar="$PiralTopBar.ATT"<% if $PiralPilets %> data-pilets="$PiralPilets.ATT"<% end_if %>></div>
</body>
</html>
