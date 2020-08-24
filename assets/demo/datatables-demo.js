// Call the dataTables jQuery plugin
$(document).ready(function() {
  var table = $('#dataTable').DataTable( {
    data: [
      ["None","None","None","None", "None"],
    ],
    lengthMenu: [
      [ 5, 10, 20, -1 ],
      [ '5 rows', '10 rows', '20 rows', 'Show all' ]
    ],
    columns: [
        { title: "Bus Code" },
        { title: "Current Location" },
        { title: "ETA"},
        { title: "Progress Status"},
        { title: "Next Stop"}
        // { title: "Origin" },
        // { title: "Destination" },
    ]
  });

  $('#dataTable tbody').on('click', 'tr', function () {
    var busData = table.row( this ).data();
    //alert( 'You clicked on '+data[0]+'\'s row' );
    myCall(busData);
  });

});
