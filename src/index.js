import GtfsRealtimeBindings from 'gtfs-realtime-bindings';

export default {
  async fetch(request, env, ctx) {
    // Read the stop ID from the URL parameters (e.g., ?stop=8220DB000002)
    // If no parameter is provided, it defaults to a placeholder stop ID
    const urlObj = new URL(request.url);
    const targetStopId = urlObj.searchParams.get('stop') || '8220DB000002';

    // The NTA v2 Trip Updates endpoint
    const ntaUrl = 'https://api.nationaltransport.ie/gtfsr/v2/TripUpdates';
    
    // Fetch the binary data securely using your hidden API key
    const response = await fetch(ntaUrl, {
      headers: {
        'x-api-key': env.NTA_API_KEY
      }
    });

    if (!response.ok) {
      return new Response(JSON.stringify({ error: 'Failed to fetch from NTA API' }), { 
        status: response.status,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const buffer = await response.arrayBuffer();
    
    // Decode the Protocol Buffers binary into a readable object
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(new Uint8Array(buffer));
    
    let incomingBuses = [];

    // Search the feed for the specific stop ID
    feed.entity.forEach((entity) => {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        entity.tripUpdate.stopTimeUpdate.forEach((stopUpdate) => {
          if (stopUpdate.stopId === targetStopId) {
            
            // Buses at the first stop often only have a departure time, so we check both
            const timing = stopUpdate.arrival || stopUpdate.departure;
            let timeSecs = null;

            if (timing && timing.time) {
              // Safely extract the timestamp regardless of how the protobuf library parsed it
              if (typeof timing.time === 'number') {
                timeSecs = timing.time;
              } else if (typeof timing.time === 'string') {
                timeSecs = parseInt(timing.time, 10);
              } else if (typeof timing.time === 'object') {
                timeSecs = timing.time.toNumber ? timing.time.toNumber() : timing.time.low;
              }
            }

            // Format the time, or fall back to explaining the delay
            let timeFormatted = 'Unknown';
            if (timeSecs) {
              timeFormatted = new Date(timeSecs * 1000).toLocaleTimeString('en-IE', { timeZone: 'Europe/Dublin' });
            } else if (timing && timing.delay !== undefined && timing.delay !== null) {
              const delayMins = Math.round(timing.delay / 60);
              timeFormatted = `Scheduled time ${delayMins >= 0 ? '+' : ''}${delayMins} min`;
            }

            incomingBuses.push({
               routeId: entity.tripUpdate.trip.routeId,
               delaySeconds: timing?.delay || 0,
               arrivalTime: timeFormatted
            });
          }
        });
      }
    });
    // Return the clean JSON structure for your SenseCraft dashboard
    return Response.json({
        stopId: targetStopId,
        buses: incomingBuses
    });
  }
};
