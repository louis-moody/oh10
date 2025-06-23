import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// fix: manual endpoint to update YieldDistributor address (Cursor Rule 4)
export async function POST(request: NextRequest) {
  try {
    if (!supabaseAdmin) {
      return NextResponse.json({ error: 'Database not available' }, { status: 500 })
    }

    const { property_id, yield_distributor_address } = await request.json()

    if (!property_id || !yield_distributor_address) {
      return NextResponse.json({ 
        error: 'Missing required fields: property_id, yield_distributor_address' 
      }, { status: 400 })
    }

    // fix: update property_token_details with YieldDistributor address (Cursor Rule 4)
    const { data, error } = await supabaseAdmin
      .from('property_token_details')
      .update({
        yield_distributor_address,
        yield_distributor_deployed_at: new Date().toISOString()
      })
      .eq('property_id', property_id)
      .select()

    if (error) {
      console.error('Database update error:', error)
      return NextResponse.json({ 
        error: `Database update failed: ${error.message}` 
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'YieldDistributor address updated successfully',
      data: data[0]
    })

  } catch (error) {
    console.error('Update yield distributor error:', error)
    return NextResponse.json({ 
      error: 'Internal server error' 
    }, { status: 500 })
  }
} 