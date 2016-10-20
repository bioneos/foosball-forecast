var express = require('express'),
    request = require('request'),
    moment = require('moment-timezone'),
    humanize = require('humanize-duration'),
    bodyParser = require('body-parser');
var cool = require('cool-ascii-faces');
var app = express();


app.use(bodyParser.urlencoded());
/**
 * Input html string of the day for foos.
 * Function that returns an array of the free times throughout
 * the day.
 */
function getOpenTimes(resourceBookingPage, currTime) {
  var startTime = currTime.clone().hours(8).minutes(0).seconds(0).milliseconds(0);
  var times = [];
  for (var i=0; i<18; i++)
  {
    var addedMinutes = 30 * i;
    var date = startTime.clone().add(addedMinutes, 'minutes');
    times.push(date);
  }
  
  var availableTimes = [];
  for (var i=0; i<times.length; i++)
  {
    if (resourceBookingPage.indexOf('id="R' + i + 'C2"') != -1)
    {
      availableTimes.push(times[i]);
    }
  }
  return availableTimes;
}

function getNextAvailableTime(openTimes, currTime)
{
  var nextAvailableTime = null;
  
  if (currTime.hours() >= 17 || currTime.hours() < 8)
  {
    return currTime;
  }
  for (var i=openTimes.length-1; i>=0; i--)
  {
    var openTime = openTimes[i];
    var openTimeEnd = openTime.clone().add(30, 'minutes');
    
    // Current time is right in the middle of an open slot.  
    if (openTime.isSameOrBefore(currTime) && currTime.isBefore(openTimeEnd))
    {
      var nextSlotAdj;
      if (i === openTimes.length - 1)
      {
        nextSlotAdj = false;
      }
      else
      {
        var currTimeCopy = currTime.clone();
        nextSlotAdj = openTimes[i+1].isSameOrBefore(currTime.clone().add(30, 'minutes'));
      } 
      // If it is at the end of the day, change to true.
      nextSlotAdj = nextSlotAdj || (currTime.hours() >= 16 && currTime.minutes() >= 30);

      var enoughTimeThisSlot = (currTime.diff(openTime, 'minutes', true) <= 10);
      // IF there is enough time this slot or the next slot is adjacent to this slot we can play now.
      if (enoughTimeThisSlot || nextSlotAdj)
      {
        nextAvailableTime=currTime.clone();
      }
      break;
    }
    else if(openTime.isBefore(currTime))
    {
      // Current time is after open time and not currently in the middle of an open slot.
      break;
    }
    else
    {
      // Current time is before the open time in question.
      // Set the nextAvailableTime to the current Open time and continue the loop.
      nextAvailableTime = openTime.clone();
    }
  }
  return nextAvailableTime;
}

function getLengthOfAvailableTime(openTimes, currTime) 
{
  var endOfOpenTime;
  var totalMinutes = 0;
  for (var i=0; i<openTimes.length; i++)
  {
    if (openTimes[i].clone().add(30, 'minutes').isAfter(currTime))
    {
      if (endOfOpenTime == null)
      {
        endOfOpenTime = openTimes[i].clone().add(30, 'minutes');
        totalMinutes += endOfOpenTime.diff(currTime, 'minutes');
      }
      else
      {
        if (openTimes[i].isSame(endOfOpenTime))
        {
          endOfOpenTime = openTimes[i].clone().add(30, 'minutes');
          totalMinutes += 30;
        }
        else
        {
          break;
        }
      }
    }
    openTimes.shift();
    i--;
  }
  return totalMinutes;
}

function getResponseText(nextAvailable, currentTime, openTimes)
{
  var responseText;
  if (nextAvailable === null)
  {
    responseText = '0% chance of foos.  Meetings have moved into the area and will be around all day.';
  } 
  else if (nextAvailable.isSameOrBefore(currentTime))
  {
    var openTimesClone = openTimes.slice(0);
    var lengthOfTime = moment.duration(getLengthOfAvailableTime(openTimesClone, currentTime), 'minutes');
    console.log('length of time: ' + lengthOfTime + ' minutes');
    
    if (openTimesClone.length == 0)
    {
      responseText = 'The table is open for the rest of the day.  Foos on';
    }
    else
    {
      responseText = 'The foosball table is open now for ' + humanize(lengthOfTime, { delimiter: ' and ', units: ['h', 'm'] }) + 
          '.  After that the next available time is at ' + openTimesClone[0].format('h:mm');
    }
  }
  else
  {
    responseText = 'It\'s looking gloomy for Mike and Steve at ' + nextAvailable.format('h:mm');
  }
  return responseText;
}

function formatScheduleAttachment(currTime, nextAvailable, openTimes) 
{
  var returnVal = {};
  if (openTimes.length > 0)
  {
    var timeFrameArr = [];
    var startTime = openTimes[0].clone();
    var endTime = openTimes[0].clone().add(30, 'minutes');
    for (var i=1; i<openTimes.length; i++)
    {
       if (openTimes[i].isSame(endTime))
       {
         endTime.add(30, 'minutes');
       }
       else 
       {
         var timeFrameObj = {};
         timeFrameObj.start = startTime.clone();
         timeFrameObj.end = endTime.clone();
         timeFrameArr.push(timeFrameObj);
         startTime = openTimes[i].clone();
         endTime = openTimes[i].clone().add(30, 'minutes');
       }
    }
    // Push the remaining timeframe into the array.
    var timeFrameObj = {};
    timeFrameObj.start = startTime.clone();
    timeFrameObj.end = endTime.clone();
    timeFrameArr.push(timeFrameObj);
    
    console.log('time frame array length: ' + timeFrameArr.length);
    var schedString = '| '
    for (var i=0; i<timeFrameArr.length; i++)
    {
      if (nextAvailable.isSameOrAfter(timeFrameArr[i].start) && nextAvailable.isBefore(timeFrameArr[i].end))
      {
        schedString += '*' + timeFrameArr[i].start.format('h:mm') + ' - ' + timeFrameArr[i].end.format('h:mm') + '* | ';
      }
      else
      {
        schedString += timeFrameArr[i].start.format('h:mm') + ' - ' + timeFrameArr[i].end.format('h:mm') + ' | ';
      }
    }
    returnVal.text = schedString;
    returnVal.title = 'Schedule';
    returnVal.mrkdwn_in = ['text'];
  }
  else
  {
    returnVal.text = "You should probably just play quietly";
  }
  
  

  return returnVal;
}

app.post('/', function (req, res) {
  // TODO: change to a process env variable in heroku
  console.log('text=' + req.body.text);
  
  res.set({ 'Content-Type': 'application/json' });
  console.log('res.headers=' + JSON.stringify(res.headers));
  if (req.body.token !== process.env.TOKEN && !process.env.DEVELOPMENT)
  {
    res.send('Nope not authorized sucka');
  }
  else
  {
    request('http://uiowa.incutrack.net/resourcebooking/default.aspx?uid=48066.3675999', function (error, response, body) {
      if (!error && response.statusCode == 200) {
        // Get the current time for our timezone, daylight savings time adjusted
        var currentTime = moment().tz('America/Chicago');
        console.log('current time: ' + currentTime.format('h:mm'));
        var openTimes = getOpenTimes(body, currentTime);
        var nextAvailable = getNextAvailableTime(openTimes, currentTime);
        console.log('next available time: ' + nextAvailable.format('h:mm'));
        
        // TODO: clean this up.  All this can go into a new method, getResponse() and getLengthOfAvailableTimes 
        //       method probably shouldn't adjust the openTimes array.
        var responseObj = {};
        responseObj.response_type = 'in_channel';
        responseObj.text = getResponseText(nextAvailable, currentTime, openTimes);
        responseObj.attachments = [];
        responseObj.attachments.push(formatScheduleAttachment(currentTime, nextAvailable, openTimes.slice(0)));

        
      }
      else {
        res.status(500); 
        responseObj.text = 'Error:  Unable to find next foosball time.';
      }
     
      if (req.body.response_url == null) 
        res.send(JSON.stringify(responseObj));
      else
      {
        res.send();
        request.post({url: req.body.response_url, 
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(responseObj)
        }, function(error, response, body) {
          if (error)
          {
            console.log('Problem posting to response url: ' + error.message)
          }
          else
          {
            console.log('response: ' + response + '\nbody: '+ body );
          }
        });
      }
    });
  }
});

app.get('/cool', function(request, response) {
  response.send(cool());
});

app.listen(process.env.PORT || 3000, function () {
  console.log('Example app listening on port 3000!');
});
