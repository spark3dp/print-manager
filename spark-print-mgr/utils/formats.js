// Formats for various resource types
module.exports = {
    printerTypeCommon: {
        id: String,
        version: Number,
        manufacturer: String,
        name: String,
        technology: String,
        default_material_id: String,
        default_profile_id: String,
        icon_id: String,
        supported_connections: Array,

        build_volume: {
            type: String,
            bed_size: Array,
            bed_file_id: String,
            park_position: Array,
            home_position: Array
        },

        printable: {
            //packager_file_id: String // TODO: Not all printers have a packager yet so this has been commented out.
            //packager_data: Object     // Optional
        },
        _files: Array
    },

    printerTypeFDM: {
        // Torpedo additions
        printer_capabilities: {
            num_extruders: Number,
            nozzle_diameter: Number,
            nozzle_temp_max: Number,
            bed_temp_max: Number,
            xy_speed_max: Number,
            z_speed_max: Number,
            e_speed_max: Number
        }
    },

    supportedConnection: {
        type: String,
        protocol: String
        //info: Object      // Optional
    },

    printer: {
        id: String,
        name: String,
        type_id: String,
        /*firmware: {},  */ // Optional. Currently no way to get firmware version from a typea printer.
        default_material_id: String,
        default_profile_id: String
    },

    firmware: {
        type: String,
        version: String
    },

    materialCommon: {
        id: String,
        version: Number,
        manufacturer: String,
        name: String,
        technology: String,
        composition: String,
        printer_types: Array,
        cost: Number,
        website: String,
        color: String,
        opacity: Number,
        rating: Number,
        tags: Array,
        //pct_shrink: Number,   // Can't be checked with format function since it can also be null.
        //prism_URN: Number,    // Tentative
        is_user: Boolean
    },

    materialFDM: {
        filament_diameter: Number,
        filament_extrusion_to_flow_multiplier: Number,
        temp_extrude_default: Number,
        temp_min_extrude: Number,
        temp_max_extrude: Number,
        temp_bed: Number,
        min_nozzle_diameter: Number,
        extruder_fan_speed: Number
    },

    materialDLP: {
        FirstExposureSec: Number,
        BurnInLayers: Number,
        BurnInExposureSec: Number,
        ModelExposureSec: Number,
        density: Number
    },

    profile: {
        id: String,
        version: Number,
        name: String,
        technology: String,
        printer_types: Array,
        layer_height: Number,
        support_angle_tol: Number,
        support_contact_tol: Number
        // TODO: Find out what the undocumented fields are and document them
    },

    mesh: {
        id: String,
        name: String,
        internal_file_id: String,
        transform: Array,
        geom: {
            num_vertices: Number,
            num_triangles: Number,
            has_uvs: Boolean,
            bounding_box: {
                min: Array,
                max: Array
            }
        },
        //visual_file_id: String, // Optional
        analyzed: Boolean
        //problems: Array // Optional, dependent on analyzed being true
    },

    tray: {
        id: String,
        printer_type_id: String,
        profile_id: String,
        default_material_id: String,
        meshes: Array,
        // mesh_attrs: Object, // Not optional but can't be checked with a format
        state: String,
        ready: Boolean
    }
};
